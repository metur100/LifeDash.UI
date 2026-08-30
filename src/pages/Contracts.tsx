import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { ContractFlowType, FamilyMember, Subscription } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const FLOW_TYPE_OPTIONS = [
  { value: "cost", label: "Kosten" },
  { value: "income", label: "Einnahme" },
  { value: "none", label: "Keine Zahlung" },
];

function flowTypeLabel(flowType: string): string {
  return FLOW_TYPE_OPTIONS.find((o) => o.value === flowType)?.label ?? flowType;
}

function parseNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function cadenceLabel(cadence: string): string {
  if (cadence === "monthly") return "monatlich";
  if (cadence === "quarterly") return "quartalsweise";
  if (cadence === "yearly") return "jährlich";
  return cadence;
}

export default function Contracts() {
  const contracts = useAsync<Subscription[]>(() => api.get("/api/subscriptions"), []);
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  const memberNameById = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.fullName])), [members.data]);

  const rows = useMemo(() => {
    return (contracts.data ?? []).map((s) => ({
      s,
      memberName: s.familyMemberId ? (memberNameById.get(s.familyMemberId) ?? "-") : "-",
    })).sort((a, b) => (a.s.startOn || "9999-12-31").localeCompare(b.s.startOn || "9999-12-31"));
  }, [contracts.data, memberNameById]);

  function contractFields(memberOptions: Array<{ value: string; label: string }>) {
    return [
      { key: "name", label: "Vertrag" },
      { key: "flowType", label: "Art", type: "select" as const, options: FLOW_TYPE_OPTIONS },
      { key: "familyMemberId", label: "Person", type: "select" as const, options: memberOptions },
      { key: "amount", label: "Betrag", type: "number" as const, visibleWhen: (d: Record<string, unknown>) => String(d.flowType ?? "") !== "none" },
      {
        key: "cadence", label: "Turnus", type: "select" as const,
        visibleWhen: (d: Record<string, unknown>) => String(d.flowType ?? "") !== "none",
        options: [
          { value: "monthly", label: "monatlich" },
          { value: "quarterly", label: "quartalsweise" },
          { value: "yearly", label: "jährlich" },
        ],
      },
      { key: "startOn", label: "Startdatum", type: "date" as const },
      { key: "endOn", label: "Enddatum", type: "date" as const },
      { key: "cancelByOn", label: "Kündigen bis", type: "date" as const },
      { key: "noticeText", label: "Hinweis" },
    ];
  }

  async function addContract() {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Vertrag hinzufügen",
      submitText: "Anlegen",
      fields: contractFields(memberOptions),
      initial: {
        name: "",
        flowType: "cost",
        familyMemberId: "",
        amount: "",
        cadence: "monthly",
        startOn: today(),
        endOn: "",
        cancelByOn: "",
        noticeText: "",
      },
    });
    if (!values) return;
    if (!String(values.name).trim()) return;

    const flowType = String(values.flowType || "cost") as ContractFlowType;

    try {
      await api.post("/api/subscriptions", {
        name: String(values.name).trim(),
        provider: null,
        flowType,
        familyMemberId: String(values.familyMemberId ?? "").trim() ? Number(values.familyMemberId) : null,
        amount: flowType === "none" ? null : parseNumber(values.amount),
        currency: "EUR",
        cadence: String(values.cadence || "monthly"),
        startOn: String(values.startOn ?? "").trim() || null,
        endOn: String(values.endOn ?? "").trim() || null,
        renewsOn: String(values.startOn).trim() || today(),
        cancelByOn: String(values.cancelByOn ?? "").trim() || null,
        noticePeriodDays: null,
        noticeText: String(values.noticeText ?? "").trim() || null,
        isActive: true,
        notes: null,
      });
      contracts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editContract(s: Subscription) {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Vertrag bearbeiten",
      submitText: "Speichern",
      fields: contractFields(memberOptions),
      initial: {
        name: s.name,
        flowType: s.flowType,
        familyMemberId: s.familyMemberId ? String(s.familyMemberId) : "",
        amount: s.amount === null || s.amount === undefined ? "" : String(s.amount),
        cadence: s.cadence,
        startOn: s.startOn ?? "",
        endOn: s.endOn ?? "",
        cancelByOn: s.cancelByOn ?? "",
        noticeText: s.noticeText ?? "",
      },
    });
    if (!values) return;

    const flowType = String(values.flowType || "cost") as ContractFlowType;

    try {
      await api.put(`/api/subscriptions/${s.id}`, {
        ...s,
        name: String(values.name).trim(),
        provider: null,
        flowType,
        familyMemberId: String(values.familyMemberId ?? "").trim() ? Number(values.familyMemberId) : null,
        amount: flowType === "none" ? null : parseNumber(values.amount),
        cadence: String(values.cadence || "monthly"),
        startOn: String(values.startOn ?? "").trim() || null,
        endOn: String(values.endOn ?? "").trim() || null,
        renewsOn: String(values.startOn).trim() || s.renewsOn,
        cancelByOn: String(values.cancelByOn ?? "").trim() || null,
        noticePeriodDays: null,
        noticeText: String(values.noticeText ?? "").trim() || null,
      });
      contracts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeContract(id: number) {
    const ok = await dialog.confirm({
      title: "Vertrag löschen",
      message: "Vertrag wirklich löschen?",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/subscriptions/${id}`);
      contracts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Verträge"
        title="Verträge und Kündigungen"
        lede="Verträge, Laufzeiten und Hinweise im Blick — unabhängig davon, ob sie Geld kosten, einbringen oder gar nichts bewegen."
      />
      <ErrorBar message={error ?? contracts.error ?? members.error} />

      <Section title="Verträge" action={<button className="btn icon-only" aria-label="Vertrag hinzufügen" title="Vertrag hinzufügen" onClick={addContract}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Vertrag hinzufügen</span></button>}>
        {rows.length === 0
          ? <Empty title="Noch keine Verträge." hint="Lege Verträge mit Startdatum, Enddatum und Kündigungsfrist an — auch solche ohne Zahlung, z.B. einen Betreuungsvertrag." />
          : <div className="card">
              <div className="table-scroll contracts-scroll contracts-desktop">
                <table className="contracts-table">
                  <thead><tr><th>Vertrag</th><th>Art</th><th>Person</th><th className="num">Betrag</th><th>Turnus</th><th>Startdatum</th><th>Enddatum</th><th>Kündigen bis</th><th>Hinweis</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {rows.map(({ s, memberName }) => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td><span className="badge">{flowTypeLabel(s.flowType)}</span></td>
                        <td>{memberName}</td>
                        <td className="num">{s.flowType === "none" ? "-" : euro(s.amount ?? 0, s.currency)}</td>
                        <td>{s.flowType === "none" ? "-" : cadenceLabel(s.cadence)}</td>
                        <td>{shortDate(s.startOn)}</td>
                        <td>{shortDate(s.endOn)}</td>
                        <td>{shortDate(s.cancelByOn)}</td>
                        <td>{s.noticeText || "-"}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
                            <button className="btn ghost small icon-only" aria-label="Vertrag bearbeiten" title="Vertrag bearbeiten" onClick={() => editContract(s)}>
                              <i className="fa-solid fa-pen-to-square" aria-hidden />
                              <span className="sr-only">Bearbeiten</span>
                            </button>
                            <button className="btn danger small icon-only" aria-label="Vertrag löschen" title="Vertrag löschen" onClick={() => removeContract(s.id)}>
                              <i className="fa-solid fa-trash" aria-hidden />
                              <span className="sr-only">Löschen</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="contracts-mobile">
                {rows.map(({ s, memberName }) => (
                  <div key={`m-${s.id}`} className="contracts-mobile-card">
                    <div className="contracts-mobile-head">
                      <strong>{s.name}</strong>
                      <span className="badge">{s.flowType === "none" ? flowTypeLabel(s.flowType) : euro(s.amount ?? 0, s.currency)}</span>
                    </div>
                    <div className="alert-msg">{flowTypeLabel(s.flowType)} · {memberName}{s.flowType !== "none" ? ` · ${cadenceLabel(s.cadence)}` : ""}</div>
                    <div className="contracts-mobile-grid">
                      <span>Start: {shortDate(s.startOn)}</span>
                      <span>Ende: {shortDate(s.endOn)}</span>
                      <span>Kündigen bis: {shortDate(s.cancelByOn)}</span>
                      <span>Hinweis: {s.noticeText || "-"}</span>
                    </div>
                    <div className="action-stack contracts-mobile-actions">
                      <button className="btn ghost small icon-only" aria-label="Vertrag bearbeiten" title="Vertrag bearbeiten" onClick={() => editContract(s)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Vertrag löschen" title="Vertrag löschen" onClick={() => removeContract(s.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
      </Section>
    </>
  );
}
