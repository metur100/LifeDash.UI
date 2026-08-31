import { useState } from "react";
import { api } from "../api/client";
import type { AuthorityCase } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead } from "../components/Ui";
import { countdown, daysUntil, shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const caseLabels: Record<string, string> = {
  Einbuergerung: "Einbürgerung", Aufenthalt: "Aufenthalt",
  Kindergeld: "Kindergeld", Kinderzuschlag: "Kinderzuschlag",
  Steuern: "Steuern", Versicherung: "Versicherung",
};

const statusTone: Record<string, string> = {
  open: "amber", waiting: "indigo", submitted: "indigo",
  approved: "green", rejected: "red", closed: "",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Offen" },
  { value: "waiting", label: "Wartend" },
  { value: "submitted", label: "Eingereicht" },
  { value: "approved", label: "Bewilligt" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "closed", label: "Abgeschlossen" },
];

const statusLabelByValue = new Map(STATUS_OPTIONS.map((x) => [x.value, x.label]));
const CLOSED_STATUSES = ["closed", "approved", "rejected"];
const isClosedStatus = (status: string) => CLOSED_STATUSES.includes(status);

export default function Authorities() {
  const cases = useAsync<AuthorityCase[]>(() => api.get("/api/authority-cases"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");

  async function createCase() {
    const values = await dialog.form({
      title: "Neuen Antrag anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Titel" },
        {
          key: "caseType",
          label: "Typ",
          type: "select",
          options: Object.entries(caseLabels).map(([value, label]) => ({ value, label })),
        },
        { key: "authority", label: "Behörde" },
        { key: "referenceNo", label: "Aktenzeichen" },
        { key: "deadlineOn", label: "Frist", type: "date" },
      ],
      initial: {
        title: "",
        caseType: "Aufenthalt",
        authority: "",
        referenceNo: "",
        deadlineOn: "",
      },
    });
    if (!values) return;

    const title = String(values.title).trim();
    if (!title) return;

    try {
      await api.post("/api/authority-cases", {
        caseType: String(values.caseType) || "Aufenthalt",
        title,
        authority: String(values.authority).trim() || null,
        referenceNo: String(values.referenceNo).trim() || null,
        status: "open",
        deadlineOn: String(values.deadlineOn).trim() || null,
        reminderDays: 21,
        requiredDocuments: [],
      });
      cases.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setStatus(c: AuthorityCase, status: string) {
    try {
      await api.put(`/api/authority-cases/${c.id}`, { ...c, status });
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editCase(c: AuthorityCase) {
    const values = await dialog.form({
      title: "Vorgang bearbeiten",
      submitText: "Speichern",
      fields: [
        { key: "title", label: "Titel" },
        {
          key: "caseType",
          label: "Typ",
          type: "select",
          options: Object.entries(caseLabels).map(([value, label]) => ({ value, label })),
        },
        { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
        { key: "authority", label: "Behörde" },
        { key: "referenceNo", label: "Aktenzeichen" },
        { key: "submittedOn", label: "Eingereicht am", type: "date" },
        { key: "deadlineOn", label: "Frist", type: "date" },
        { key: "nextActionOn", label: "Nächster Schritt am", type: "date" },
        { key: "reminderDays", label: "Erinnerung (Tage vorher)", type: "number" },
        { key: "notes", label: "Notizen" },
      ],
      initial: {
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        authority: c.authority ?? "",
        referenceNo: c.referenceNo ?? "",
        submittedOn: c.submittedOn ?? "",
        deadlineOn: c.deadlineOn ?? "",
        nextActionOn: c.nextActionOn ?? "",
        reminderDays: String(c.reminderDays),
        notes: c.notes ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/authority-cases/${c.id}`, {
        ...c,
        title: String(values.title).trim(),
        caseType: String(values.caseType) || c.caseType,
        status: String(values.status) || c.status,
        authority: String(values.authority).trim() || null,
        referenceNo: String(values.referenceNo).trim() || null,
        submittedOn: String(values.submittedOn).trim() || null,
        deadlineOn: String(values.deadlineOn).trim() || null,
        nextActionOn: String(values.nextActionOn).trim() || null,
        reminderDays: Number(values.reminderDays) || c.reminderDays,
        notes: String(values.notes).trim() || null,
      });
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeCase(id: number) {
    const ok = await dialog.confirm({
      title: "Vorgang löschen",
      message: "Diesen Vorgang wirklich löschen?",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/authority-cases/${id}`);
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const list = (cases.data ?? [])
    .filter((c) => filter === "all" || c.caseType === filter)
    .filter((c) => statusFilter === "all"
      || (statusFilter === "open" && !isClosedStatus(c.status))
      || (statusFilter === "closed" && isClosedStatus(c.status)));
  return (
    <>
      <PageHead eyebrow="Behörden" title="Anträge und Fristen"
        action={<button className="btn icon-only" aria-label="Antrag anlegen" title="Antrag anlegen" onClick={createCase}>
          <i className="fa-solid fa-plus" aria-hidden />
          <span className="sr-only">Antrag anlegen</span>
        </button>}
        lede="Verwalte Fristen, Status und Prioritäten deiner Vorgänge in einer klaren Ansicht." />
      <ErrorBar message={error ?? cases.error} />

      <div className="filters" role="group" aria-label="Status filtern">
        <button className={`chip ${statusFilter === "open" ? "on" : ""}`} onClick={() => setStatusFilter("open")}>Offen</button>
        <button className={`chip ${statusFilter === "closed" ? "on" : ""}`} onClick={() => setStatusFilter("closed")}>Geschlossen</button>
        <button className={`chip ${statusFilter === "all" ? "on" : ""}`} onClick={() => setStatusFilter("all")}>Alle Status</button>
      </div>

      <div className="filters">
        <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Alle</button>
        {Object.entries(caseLabels).map(([k, v]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{v}</button>
        ))}
      </div>

      {list.length === 0
        ? <Empty title="Kein Vorgang in dieser Auswahl." hint="Lege einen Antrag an, oder ändere die Filter oben." />
        : <div className="grid-2">
            {list.map((c) => {
              const days = daysUntil(c.deadlineOn);
              return (
                <article className="card" key={c.id}>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <span className="badge">{caseLabels[c.caseType] ?? c.caseType}</span>
                    <span className={`badge ${statusTone[c.status] ?? ""}`}>{statusLabelByValue.get(c.status) ?? c.status}</span>
                    <div className="spacer" />
                    {days !== null && (
                      <span className={`badge ${days < 0 ? "red" : days <= 14 ? "amber" : ""}`}>
                        {countdown(days)}
                      </span>
                    )}
                  </div>

                  <h3>{c.title}</h3>
                  <p className="alert-msg" style={{ marginTop: 0 }}>
                    {c.authority ?? "Behörde offen"}
                    {c.referenceNo ? ` · Az. ${c.referenceNo}` : ""}
                    {c.deadlineOn ? ` · Frist ${shortDate(c.deadlineOn)}` : ""}
                  </p>

                  <div className="row" style={{ marginTop: 14 }}>
                    {isClosedStatus(c.status) ? (
                      <button className="btn ghost small icon-only" aria-label="Vorgang wieder öffnen" title="Vorgang wieder öffnen" onClick={() => setStatus(c, "open")}>
                        <i className="fa-solid fa-rotate-left" aria-hidden />
                        <span className="sr-only">Wieder öffnen</span>
                      </button>
                    ) : (
                      <>
                        <button className="btn ghost small icon-only" aria-label="Als eingereicht markieren" title="Als eingereicht markieren" onClick={() => setStatus(c, "submitted")}>
                          <i className="fa-solid fa-paper-plane" aria-hidden />
                          <span className="sr-only">Eingereicht</span>
                        </button>
                        <button className="btn ghost small icon-only" aria-label="Als bewilligt markieren" title="Als bewilligt markieren" onClick={() => setStatus(c, "approved")}>
                          <i className="fa-solid fa-circle-check" aria-hidden />
                          <span className="sr-only">Bewilligt</span>
                        </button>
                        <button className="btn ghost small icon-only" aria-label="Vorgang abschließen" title="Vorgang abschließen" onClick={() => setStatus(c, "closed")}>
                          <i className="fa-solid fa-check-double" aria-hidden />
                          <span className="sr-only">Abschließen</span>
                        </button>
                      </>
                    )}
                    <button className="btn ghost small icon-only" aria-label="Vorgang bearbeiten" title="Vorgang bearbeiten" onClick={() => editCase(c)}>
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>
                    <button className="btn danger small icon-only" aria-label="Vorgang löschen" title="Vorgang löschen" onClick={() => removeCase(c.id)}>
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>}
    </>
  );
}
