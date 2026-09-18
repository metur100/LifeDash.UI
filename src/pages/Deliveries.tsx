import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../components/Dialog";
import { PackageStatusDonut, PackagesByCarrierChart } from "../components/DeliveryCharts";
import { Empty, ErrorBar, PageHead, Section, Stat } from "../components/Ui";
import { daysUntil, dateTime, shortDate } from "../lib/format";
import { api } from "../api/client";

export type CarrierType = "dhl" | "dpd" | "hermes" | "gls" | "deutschepost" | "other";

export type PackageStatus =
  | "announced" // Elektronisch angekündigt
  | "in_transit" // Unterwegs im Paketzentrum
  | "out_for_delivery" // In Zustellung (heute)
  | "delivered" // Zugestellt
  | "exception"; // Verzögerung / Problem

export type DeliveryEvent = {
  status: PackageStatus;
  text: string;
  time: string;
  at: string; // ISO timestamp, used for sorting
};

// Matches the backend Package entity (dbo.Packages) — this is the durable, server-side
// record of a shipment; the Sendungsverlauf is stored as a JSON array in historyJson.
export type PackageItem = {
  id: number;
  title: string;
  carrier: CarrierType;
  trackingNumber: string;
  sender?: string | null;
  status: PackageStatus;
  expectedDelivery?: string | null; // ISO Date "YYYY-MM-DD"
  latestEvent?: string | null;
  latestEventTime?: string | null;
  source: "manual" | "email_scan";
  updatedAt: string;
  historyJson?: string | null;
};

const CARRIER_INFO: Record<
  CarrierType,
  { name: string; icon: string; color: string; trackUrl: (num: string) => string }
> = {
  dhl: {
    name: "DHL",
    icon: "fa-solid fa-truck-fast",
    color: "#d40511",
    trackUrl: (num) =>
      `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(
        num
      )}`,
  },
  dpd: {
    name: "DPD",
    icon: "fa-solid fa-box",
    color: "#dc0032",
    trackUrl: (num) =>
      `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(num)}`,
  },
  hermes: {
    name: "Hermes",
    icon: "fa-solid fa-truck-ramp-box",
    color: "#0091ff",
    trackUrl: (num) =>
      `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${encodeURIComponent(
        num
      )}`,
  },
  gls: {
    name: "GLS",
    icon: "fa-solid fa-dolly",
    color: "#002a79",
    trackUrl: (num) =>
      `https://gls-group.com/DE/de/sendungsverfolgung?match=${encodeURIComponent(
        num
      )}`,
  },
  deutschepost: {
    name: "Deutsche Post (Brief)",
    icon: "fa-solid fa-envelope",
    color: "#ffcc00",
    trackUrl: (num) =>
      `https://www.deutschepost.de/sendung/simpleQuery.html?form.sendungsnummer=${encodeURIComponent(
        num
      )}`,
  },
  other: {
    name: "Andere",
    icon: "fa-solid fa-cube",
    color: "#766257",
    trackUrl: (num) => `https://www.parcelsapp.com/de/tracking/${encodeURIComponent(num)}`,
  },
};

const STATUS_LABELS: Record<
  PackageStatus,
  { label: string; tone: "pos" | "warn" | "neg" | "info" | "neutral"; icon: string }
> = {
  announced: { label: "Angekündigt", tone: "info", icon: "fa-regular fa-clock" },
  in_transit: { label: "Unterwegs", tone: "neutral", icon: "fa-solid fa-truck" },
  out_for_delivery: { label: "In Zustellung", tone: "warn", icon: "fa-solid fa-house-chimney-user" },
  delivered: { label: "Zugestellt", tone: "pos", icon: "fa-solid fa-circle-check" },
  exception: { label: "Verzögerung", tone: "neg", icon: "fa-solid fa-triangle-exclamation" },
};

export function autoDetectCarrier(trackingNumber: string): CarrierType {
  const clean = trackingNumber.trim().toUpperCase().replace(/\s+/g, "");
  if (!clean) return "dhl";

  if (clean.startsWith("JJD") || clean.startsWith("JD") || clean.startsWith("CY") || clean.length === 12 || clean.length === 20) {
    return "dhl";
  }
  if (clean.startsWith("H100") || (clean.length >= 11 && clean.length <= 14 && clean.startsWith("01"))) {
    return "hermes";
  }
  if (/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(clean)) {
    return "deutschepost";
  }
  if (clean.length === 14 && (clean.startsWith("0") || clean.startsWith("1"))) {
    return "dpd";
  }
  if (clean.length >= 8 && clean.length <= 12 && /^[0-9A-Z]+$/.test(clean)) {
    return "gls";
  }
  return "dhl";
}

// Parses the Sendungsverlauf JSON blob, falling back to a single synthesized entry for
// packages that don't have one yet (e.g. right after being created).
function getHistory(pkg: PackageItem): DeliveryEvent[] {
  if (pkg.historyJson) {
    try {
      const parsed = JSON.parse(pkg.historyJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fall through to the synthesized entry below
    }
  }
  if (pkg.latestEvent) {
    return [{ status: pkg.status, text: pkg.latestEvent, time: pkg.latestEventTime ?? "", at: pkg.updatedAt }];
  }
  return [];
}

function nowEntry(status: PackageStatus, text: string): DeliveryEvent {
  return { status, text, time: "Gerade eben", at: new Date().toISOString() };
}

export default function Deliveries() {
  const dialog = useDialog();
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [carrierFilter, setCarrierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [quickTrackingInput, setQuickTrackingInput] = useState("");
  const [quickTitleInput, setQuickTitleInput] = useState("");

  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Backend mailbox sync (Microsoft/Outlook via server-side IMAP + OAuth device code flow).
  const [msStatus, setMsStatus] = useState<"unknown" | "disconnected" | "pending" | "connected" | "failed">("unknown");
  const [msDeviceCode, setMsDeviceCode] = useState<{ userCode: string; verificationUrl: string; expiresAtUtc: string } | null>(null);
  const [msBusy, setMsBusy] = useState(false);
  const msPollRef = useRef<number | null>(null);

  useEffect(() => {
    void loadPackages();
    void refreshMicrosoftStatus();
    return () => {
      if (msPollRef.current) window.clearInterval(msPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPackages() {
    setLoading(true);
    try {
      const data = await api.get<PackageItem[]>("/api/packages");
      setPackages(data);
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshMicrosoftStatus() {
    try {
      const res = await api.get<{ connected: boolean; status: string; error: string | null }>("/api/deliveries/microsoft/connect/status");
      setMsStatus(res.connected ? "connected" : (res.status as typeof msStatus) || "disconnected");
    } catch {
      // Backend unreachable or not logged in yet — leave the feature dormant rather than erroring.
    }
  }

  function pollMicrosoftStatus() {
    if (msPollRef.current) window.clearInterval(msPollRef.current);
    const startedAt = Date.now();
    msPollRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        if (msPollRef.current) window.clearInterval(msPollRef.current);
        return;
      }
      try {
        const res = await api.get<{ connected: boolean; status: string; error: string | null }>("/api/deliveries/microsoft/connect/status");
        if (res.connected) {
          if (msPollRef.current) window.clearInterval(msPollRef.current);
          setMsStatus("connected");
          setMsDeviceCode(null);
          setSyncMessage("Outlook verbunden.");
          // First scan after connecting digs through the full mailbox history once;
          // later manual re-scans only look at the last few days (see scanMicrosoftMailbox).
          void scanMicrosoftMailbox(true);
        } else if (res.status === "failed") {
          if (msPollRef.current) window.clearInterval(msPollRef.current);
          setMsStatus("failed");
          setMsDeviceCode(null);
          setSyncError(res.error || "Microsoft-Anmeldung fehlgeschlagen oder abgelaufen.");
        }
      } catch {
        // transient network hiccup while polling — try again next tick
      }
    }, 3000);
  }

  async function startMicrosoftConnect() {
    setSyncError(null);
    setSyncMessage(null);
    setMsBusy(true);
    try {
      const info = await api.post<{ userCode: string; verificationUrl: string; message: string; expiresAtUtc: string }>(
        "/api/deliveries/microsoft/connect/start"
      );
      setMsDeviceCode(info);
      setMsStatus("pending");
      pollMicrosoftStatus();
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setMsBusy(false);
    }
  }

  async function scanMicrosoftMailbox(full = false) {
    setSyncError(null);
    setMsBusy(true);
    try {
      const res = await api.post<{ success: boolean; scanned: number; added: number; updated: number }>(
        `/api/deliveries/scan${full ? "?full=true" : ""}`
      );
      await loadPackages();
      setSyncMessage(
        res.added + res.updated === 0
          ? "Postfach durchsucht — keine neuen Sendungen gefunden."
          : `Postfach durchsucht: ${res.added} neu, ${res.updated} aktualisiert.`
      );
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setMsBusy(false);
    }
  }

  function handleMicrosoftButtonClick() {
    if (msStatus === "connected") { void scanMicrosoftMailbox(false); return; }
    if (msStatus === "pending" || msBusy) return;
    void startMicrosoftConnect();
  }

  const activeCount = packages.filter((p) => p.status !== "delivered").length;
  const todayCount = packages.filter((p) => p.status === "out_for_delivery").length;
  const deliveredCount = packages.filter((p) => p.status === "delivered").length;

  const filtered = useMemo(() => {
    return packages.filter((p) => {
      if (carrierFilter !== "all" && p.carrier !== carrierFilter) return false;
      if (statusFilter === "active" && p.status === "delivered") return false;
      if (statusFilter === "delivered" && p.status !== "delivered") return false;
      return true;
    });
  }, [packages, carrierFilter, statusFilter]);

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const tracking = quickTrackingInput.trim();
    if (!tracking) return;

    const detected = autoDetectCarrier(tracking);
    const title = quickTitleInput.trim() || `${CARRIER_INFO[detected].name} Sendung (${tracking.slice(-6)})`;
    const entry = nowEntry("in_transit", "Sendungsnummer hinzugefügt");

    setSyncError(null);
    try {
      const created = await api.post<PackageItem>("/api/packages", {
        title,
        carrier: detected,
        trackingNumber: tracking,
        status: "in_transit",
        expectedDelivery: null,
        latestEvent: entry.text,
        latestEventTime: entry.time,
        source: "manual",
        updatedAt: new Date().toISOString(),
        historyJson: JSON.stringify([entry]),
      });
      setPackages((current) => [created, ...current]);
      setQuickTrackingInput("");
      setQuickTitleInput("");
    } catch (e) {
      setSyncError((e as Error).message);
    }
  }

  async function addPackageDetailed() {
    const values = await dialog.form({
      title: "Neue Sendung hinzufügen",
      submitText: "Sendung speichern",
      fields: [
        { key: "trackingNumber", label: "Sendungsnummer" },
        { key: "title", label: "Bezeichnung (z. B. Schuhe, Ersatzteil)" },
        {
          key: "carrier",
          label: "Paketdienst",
          type: "select",
          options: [
            { label: "Automatisch erkennen", value: "auto" },
            { label: "DHL", value: "dhl" },
            { label: "DPD", value: "dpd" },
            { label: "Hermes", value: "hermes" },
            { label: "GLS", value: "gls" },
            { label: "Deutsche Post (Brief)", value: "deutschepost" },
            { label: "Andere", value: "other" },
          ],
        },
        { key: "sender", label: "Absender / Händler (z. B. Amazon, Zalando)" },
        { key: "expectedDelivery", label: "Voraussichtliche Zustellung", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { label: "Unterwegs", value: "in_transit" },
            { label: "In Zustellung (heute)", value: "out_for_delivery" },
            { label: "Angekündigt", value: "announced" },
            { label: "Zugestellt", value: "delivered" },
            { label: "Verzögerung / Problem", value: "exception" },
          ],
        },
      ],
      initial: {
        trackingNumber: "",
        title: "",
        carrier: "auto",
        sender: "",
        expectedDelivery: "",
        status: "in_transit",
      },
    });

    if (!values) return;
    const trackingNumber = String(values.trackingNumber || "").trim();
    const title = String(values.title || "").trim();
    if (!title && !trackingNumber) return;

    let chosenCarrier: CarrierType = "dhl";
    if (values.carrier === "auto" || !values.carrier) {
      chosenCarrier = autoDetectCarrier(trackingNumber);
    } else {
      chosenCarrier = values.carrier as CarrierType;
    }

    const status = (values.status as PackageStatus) || "in_transit";
    const entry = nowEntry(status, "Manuell hinzugefügt");

    setSyncError(null);
    try {
      const created = await api.post<PackageItem>("/api/packages", {
        title: title || `${CARRIER_INFO[chosenCarrier].name} Sendung (${trackingNumber.slice(-6)})`,
        carrier: chosenCarrier,
        trackingNumber: trackingNumber || "Keine Nummer",
        sender: String(values.sender || "").trim() || null,
        status,
        expectedDelivery: values.expectedDelivery ? String(values.expectedDelivery) : null,
        latestEvent: entry.text,
        latestEventTime: entry.time,
        source: "manual",
        updatedAt: new Date().toISOString(),
        historyJson: JSON.stringify([entry]),
      });
      setPackages((current) => [created, ...current]);
    } catch (e) {
      setSyncError((e as Error).message);
    }
  }

  async function editPackage(pkg: PackageItem) {
    const values = await dialog.form({
      title: "Sendung bearbeiten",
      submitText: "Änderungen speichern",
      fields: [
        { key: "trackingNumber", label: "Sendungsnummer" },
        { key: "title", label: "Bezeichnung" },
        {
          key: "carrier",
          label: "Paketdienst",
          type: "select",
          options: [
            { label: "DHL", value: "dhl" },
            { label: "DPD", value: "dpd" },
            { label: "Hermes", value: "hermes" },
            { label: "GLS", value: "gls" },
            { label: "Deutsche Post (Brief)", value: "deutschepost" },
            { label: "Andere", value: "other" },
          ],
        },
        { key: "sender", label: "Absender / Händler" },
        { key: "expectedDelivery", label: "Voraussichtliche Zustellung", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { label: "Angekündigt", value: "announced" },
            { label: "Unterwegs", value: "in_transit" },
            { label: "In Zustellung (heute)", value: "out_for_delivery" },
            { label: "Zugestellt", value: "delivered" },
            { label: "Verzögerung / Problem", value: "exception" },
          ],
        },
      ],
      initial: {
        trackingNumber: pkg.trackingNumber,
        title: pkg.title,
        carrier: pkg.carrier,
        sender: pkg.sender ?? "",
        expectedDelivery: pkg.expectedDelivery ?? "",
        status: pkg.status,
      },
    });

    if (!values) return;
    const nextStatus = (values.status as PackageStatus) || pkg.status;
    const statusChanged = nextStatus !== pkg.status;
    const history = getHistory(pkg);
    const entry = statusChanged ? nowEntry(nextStatus, "Status manuell geändert") : null;

    const body: Omit<PackageItem, "id"> = {
      trackingNumber: String(values.trackingNumber || pkg.trackingNumber).trim() || pkg.trackingNumber,
      title: String(values.title || pkg.title).trim() || pkg.title,
      carrier: (values.carrier as CarrierType) || pkg.carrier,
      sender: String(values.sender || "").trim() || null,
      expectedDelivery: values.expectedDelivery ? String(values.expectedDelivery) : null,
      status: nextStatus,
      latestEvent: entry ? entry.text : pkg.latestEvent,
      latestEventTime: entry ? entry.time : pkg.latestEventTime,
      source: pkg.source,
      updatedAt: new Date().toISOString(),
      historyJson: JSON.stringify(entry ? [...history, entry] : history),
    };

    setSyncError(null);
    try {
      const updatedPkg = await api.put<PackageItem>(`/api/packages/${pkg.id}`, body);
      setPackages((current) => current.map((p) => (p.id === pkg.id ? updatedPkg : p)));
    } catch (e) {
      setSyncError((e as Error).message);
    }
  }

  async function toggleDelivered(pkg: PackageItem) {
    const isNowDelivered = pkg.status !== "delivered";
    const entry = nowEntry(
      isNowDelivered ? "delivered" : "in_transit",
      isNowDelivered ? "Sendung wurde erfolgreich zugestellt." : "Sendung wieder als aktiv markiert."
    );
    const body: Omit<PackageItem, "id"> = {
      ...pkg,
      status: entry.status,
      latestEvent: entry.text,
      latestEventTime: entry.time,
      updatedAt: new Date().toISOString(),
      historyJson: JSON.stringify([...getHistory(pkg), entry]),
    };

    setSyncError(null);
    try {
      const updatedPkg = await api.put<PackageItem>(`/api/packages/${pkg.id}`, body);
      setPackages((current) => current.map((p) => (p.id === pkg.id ? updatedPkg : p)));
    } catch (e) {
      setSyncError((e as Error).message);
    }
  }

  async function deletePackage(id: number) {
    const ok = await dialog.confirm({
      title: "Sendung löschen",
      message: "Möchtest du diese Sendung wirklich aus der Übersicht entfernen?",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;

    setSyncError(null);
    try {
      await api.del(`/api/packages/${id}`);
      setPackages((current) => current.filter((p) => p.id !== id));
    } catch (e) {
      setSyncError((e as Error).message);
    }
  }

  const microsoftIcon = msBusy || msStatus === "pending" ? "fa-spinner fa-spin" : msStatus === "connected" ? "fa-rotate" : "fa-plug";
  const microsoftLabel =
    msStatus === "connected"
      ? "Postfach jetzt nach Sendungen durchsuchen (Outlook verbunden)"
      : msStatus === "pending"
      ? "Microsoft-Anmeldung läuft…"
      : "Mit Outlook/Microsoft verbinden für automatische Statuserkennung";

  return (
    <>
      <PageHead
        eyebrow="Lieferungen & Sendungsverfolgung"
        title="Pakete im Überblick"
        lede="Verfolge deine Lieferungen von DHL, DPD, Hermes und GLS — mit 1-Klick Sendungserfassung, automatischer Diensterkennung und Direkt-Tracking."
        action={
          <div className="action-stack">
            <button
              type="button"
              className="btn ghost icon-only"
              onClick={handleMicrosoftButtonClick}
              disabled={msBusy || msStatus === "pending"}
              aria-label={microsoftLabel}
              title={microsoftLabel}
            >
              <i className={`fa-solid ${microsoftIcon}`} aria-hidden />
              <span className="sr-only">Outlook-Postfach abgleichen</span>
            </button>
            <button
              type="button"
              className="btn icon-only"
              onClick={addPackageDetailed}
              aria-label="Sendung im Detail hinzufügen"
              title="Sendung im Detail hinzufügen"
            >
              <i className="fa-solid fa-plus" aria-hidden />
              <span className="sr-only">Detail-Eintrag</span>
            </button>
          </div>
        }
      />

      <ErrorBar message={syncError} />
      {syncMessage && !syncError && <p className="auth-hint" style={{ margin: "0 0 14px" }}>{syncMessage}</p>}

      {msDeviceCode && (
        <div className="quick-tracking-card">
          <div className="quick-tracking-head">
            <i className="fa-brands fa-microsoft quick-tracking-icon" aria-hidden />
            <div>
              <strong>Microsoft-Anmeldung erforderlich</strong>
              <p>
                Öffne{" "}
                <a href={msDeviceCode.verificationUrl} target="_blank" rel="noreferrer">
                  {msDeviceCode.verificationUrl}
                </a>{" "}
                und gib den Code <code>{msDeviceCode.userCode}</code> ein, um dein Postfach zu verbinden.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1-Tap Quick Tracking Box */}
      <div className="quick-tracking-card">
        <div className="quick-tracking-head">
          <i className="fa-solid fa-bolt quick-tracking-icon" aria-hidden />
          <div>
            <strong>1-Klick Sendungserfassung</strong>
            <p>Füge einfach eine Sendungsnummer ein — der Paketdienst wird automatisch erkannt.</p>
          </div>
        </div>

        <form className="quick-tracking-form" onSubmit={handleQuickAdd}>
          <div className="quick-form-inputs">
            <input
              type="text"
              placeholder="Sendungsnummer einfügen (z. B. 0034..., 0142..., H100...)..."
              value={quickTrackingInput}
              onChange={(e) => setQuickTrackingInput(e.target.value)}
              className="quick-input-code"
              required
            />
            <input
              type="text"
              placeholder="Bezeichnung optional (z. B. Amazon Kopfhörer)"
              value={quickTitleInput}
              onChange={(e) => setQuickTitleInput(e.target.value)}
              className="quick-input-title"
            />
          </div>
          <button type="submit" className="btn icon-only" aria-label="Sendung erfassen" title="Sendung erfassen">
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Erfassen</span>
          </button>
        </form>

        {quickTrackingInput.trim() && (
          <div className="quick-detected-hint">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
            <span>
              Erkannter Paketdienst: <strong>{CARRIER_INFO[autoDetectCarrier(quickTrackingInput)].name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Overview Stats */}
      <div className="stats">
        <Stat label="Aktive Sendungen" value={String(activeCount)} note="in Zustellung / unterwegs" />
        <Stat
          label="Heute in Zustellung"
          value={String(todayCount)}
          note="wird heute zugestellt"
        />
        <Stat label="Zugestellt" value={String(deliveredCount)} tone="pos" note="abgeschlossene Pakete" />
        <Stat
          label="Unterstützte Dienste"
          value="DHL · DPD · Hermes · GLS"
          note="Automatische Erkennung"
        />
      </div>

      <div className="chart-row">
        <PackageStatusDonut packages={packages} />
        <PackagesByCarrierChart packages={packages} />
      </div>

      {/* Filters */}
      <div className="delivery-filters-row">
        <div className="filters" role="group" aria-label="Nach Status filtern">
          <button
            className={`chip ${statusFilter === "active" ? "on" : ""}`}
            onClick={() => setStatusFilter("active")}
          >
            Aktive ({activeCount})
          </button>
          <button
            className={`chip ${statusFilter === "delivered" ? "on" : ""}`}
            onClick={() => setStatusFilter("delivered")}
          >
            Zugestellt ({deliveredCount})
          </button>
          <button
            className={`chip ${statusFilter === "all" ? "on" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            Alle ({packages.length})
          </button>
        </div>

        <div className="filters" role="group" aria-label="Nach Paketdienst filtern">
          <button
            className={`chip ${carrierFilter === "all" ? "on" : ""}`}
            onClick={() => setCarrierFilter("all")}
          >
            Alle Dienste
          </button>
          <button
            className={`chip ${carrierFilter === "dhl" ? "on" : ""}`}
            onClick={() => setCarrierFilter("dhl")}
          >
            DHL
          </button>
          <button
            className={`chip ${carrierFilter === "dpd" ? "on" : ""}`}
            onClick={() => setCarrierFilter("dpd")}
          >
            DPD
          </button>
          <button
            className={`chip ${carrierFilter === "hermes" ? "on" : ""}`}
            onClick={() => setCarrierFilter("hermes")}
          >
            Hermes
          </button>
          <button
            className={`chip ${carrierFilter === "gls" ? "on" : ""}`}
            onClick={() => setCarrierFilter("gls")}
          >
            GLS
          </button>
          <button
            className={`chip ${carrierFilter === "deutschepost" ? "on" : ""}`}
            onClick={() => setCarrierFilter("deutschepost")}
          >
            Deutsche Post
          </button>
        </div>
      </div>

      {/* Package List */}
      <Section title="Sendungen">
        {loading ? (
          <Empty title="Sendungen werden geladen…" hint="Einen Moment bitte." />
        ) : filtered.length === 0 ? (
          <Empty
            title="Keine Sendungen vorhanden."
            hint="Füge oben eine Sendungsnummer ein, um deine Pakete live zu verfolgen."
          />
        ) : (
          <div className="delivery-grid">
            {filtered.map((pkg) => {
              const carrier = CARRIER_INFO[pkg.carrier] || CARRIER_INFO.other;
              const status = STATUS_LABELS[pkg.status] || STATUS_LABELS.in_transit;
              const dueDays = pkg.expectedDelivery ? daysUntil(pkg.expectedDelivery) : null;
              const history = getHistory(pkg).slice().reverse();

              return (
                <div key={pkg.id} className={`delivery-card ${pkg.status === "delivered" ? "is-delivered" : ""}`}>
                  <div className="delivery-card-head">
                    <div className="delivery-carrier-badge" style={{ borderColor: carrier.color }}>
                      <i className={carrier.icon} style={{ color: carrier.color }} aria-hidden />
                      <strong>{carrier.name}</strong>
                    </div>

                    <span className={`badge ${status.tone}`}>
                      <i className={status.icon} aria-hidden /> {status.label}
                    </span>
                  </div>

                  <div className="delivery-card-body">
                    <h4 className="delivery-title">{pkg.title}</h4>
                    {pkg.sender && (
                      <p className="delivery-sender">
                        <i className="fa-solid fa-store" aria-hidden /> {pkg.sender}
                      </p>
                    )}

                    <div className="delivery-tracking-code">
                      <span className="code-label">Sendungs-Nr.:</span>
                      <code>{pkg.trackingNumber}</code>
                    </div>

                    {history.length > 0 && (
                      <div className="delivery-history">
                        <div className="delivery-history-title">
                          <i className="fa-solid fa-timeline" aria-hidden /> Sendungsverlauf
                        </div>
                        <ul className="delivery-history-list">
                          {history.slice(0, 5).map((entry, i) => (
                            <li key={`${entry.at}-${i}`} className="delivery-history-item">
                              <i className={(STATUS_LABELS[entry.status] || STATUS_LABELS.in_transit).icon} aria-hidden />
                              <div className="delivery-history-copy">
                                <span className="delivery-history-text">{entry.text}</span>
                                <span className="delivery-history-time">{entry.time}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="delivery-delivery-date">
                      <i className="fa-regular fa-calendar" aria-hidden />
                      <span>
                        Zustellung:{" "}
                        <strong>
                          {pkg.expectedDelivery ? shortDate(pkg.expectedDelivery) : "Unbekannt"}
                        </strong>
                        {dueDays !== null && dueDays === 0 && <span className="tag-today"> (Heute)</span>}
                        {dueDays !== null && dueDays === 1 && <span className="tag-tomorrow"> (Morgen)</span>}
                      </span>
                    </div>
                    <p className="delivery-updated-hint" title={dateTime(pkg.updatedAt)}>
                      Zuletzt aktualisiert: {dateTime(pkg.updatedAt)}
                    </p>
                  </div>

                  <div className="delivery-card-actions">
                    <a
                      href={carrier.trackUrl(pkg.trackingNumber)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn ghost small icon-only"
                      aria-label={`${carrier.name} Live-Sendungsverfolgung öffnen`}
                      title={`${carrier.name} Live-Sendungsverfolgung öffnen`}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
                      <span className="sr-only">Live Tracking</span>
                    </a>

                    <button
                      type="button"
                      className="btn ghost small icon-only"
                      onClick={() => void toggleDelivered(pkg)}
                      aria-label={pkg.status === "delivered" ? "Als aktiv markieren" : "Als zugestellt markieren"}
                      title={pkg.status === "delivered" ? "Als aktiv markieren" : "Als zugestellt markieren"}
                    >
                      <i className={`fa-solid ${pkg.status === "delivered" ? "fa-rotate-left" : "fa-check"}`} aria-hidden />
                      <span className="sr-only">{pkg.status === "delivered" ? "Als aktiv markieren" : "Als zugestellt markieren"}</span>
                    </button>

                    <button
                      type="button"
                      className="btn ghost small icon-only"
                      onClick={() => void editPackage(pkg)}
                      aria-label="Sendung bearbeiten"
                      title="Sendung bearbeiten"
                    >
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>

                    <button
                      type="button"
                      className="btn danger small icon-only"
                      onClick={() => void deletePackage(pkg.id)}
                      aria-label="Sendung löschen"
                      title="Sendung löschen"
                    >
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
