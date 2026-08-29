import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { FamilyMember, Subscription } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const CONTRACT_META_START = "[family-contract-meta]";
const CONTRACT_META_END = "[/family-contract-meta]";

type ContractMeta = {
  familyMemberId: string;
  startOn: string;
  endOn: string;
  noticeText: string;
};

function parseMetaBlock(notes: string | null | undefined, startTag: string, endTag: string) {
  const text = notes ?? "";
  const start = text.indexOf(startTag);
  const end = text.indexOf(endTag);
  if (start < 0 || end < 0 || end <= start) return new Map<string, string>();

  const raw = text.slice(start + startTag.length, end).trim();
  const values = new Map<string, string>();
  for (const line of raw.split("\n").map((x) => x.trim()).filter(Boolean)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return values;
}

function writeMetaBlock(notes: string | null | undefined, startTag: string, endTag: string, entries: Array<[string, string | null]>) {
  const text = notes ?? "";
  const start = text.indexOf(startTag);
  const end = text.indexOf(endTag);

  const lines = entries
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}:${String(value)}`);
  const block = lines.length > 0 ? `${startTag}\n${lines.join("\n")}\n${endTag}` : "";

  if (start < 0 || end < 0 || end <= start) {
    if (!block) return text.trim() || null;
    return text.trim() ? `${text.trim()}\n\n${block}` : block;
  }

  const before = text.slice(0, start).trim();
  const after = text.slice(end + endTag.length).trim();
  const plain = [before, after].filter(Boolean).join("\n\n").trim();
  if (!block) return plain || null;
  return plain ? `${plain}\n\n${block}` : block;
}

function parseContractMeta(notes: string | null | undefined): ContractMeta {
  const values = parseMetaBlock(notes, CONTRACT_META_START, CONTRACT_META_END);
  return {
    familyMemberId: values.get("familyMemberId") ?? "",
    startOn: values.get("startOn") ?? "",
    endOn: values.get("endOn") ?? "",
    noticeText: values.get("noticeText") ?? "",
  };
}

function withContractMeta(notes: string | null | undefined, meta: ContractMeta): string | null {
  return writeMetaBlock(notes, CONTRACT_META_START, CONTRACT_META_END, [
    ["familyMemberId", meta.familyMemberId.trim() || null],
    ["startOn", meta.startOn.trim() || null],
    ["endOn", meta.endOn.trim() || null],
    ["noticeText", meta.noticeText.trim() || null],
  ]);
}

function parseNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function contractMemberId(s: Subscription): number | null {
  const raw = parseContractMeta(s.notes).familyMemberId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
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
    return (contracts.data ?? []).map((s) => {
      const meta = parseContractMeta(s.notes);
      const memberId = contractMemberId(s);
      const memberName = memberId ? (memberNameById.get(memberId) ?? "-") : "-";
      return {
        s,
        memberName,
        startOn: meta.startOn,
        endOn: meta.endOn,
        note: meta.noticeText,
      };
    }).sort((a, b) => (a.startOn || "9999-12-31").localeCompare(b.startOn || "9999-12-31"));
  }, [contracts.data, memberNameById]);

  async function addContract() {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Vertrag hinzufügen",
      submitText: "Anlegen",
      fields: [
        { key: "name", label: "Vertrag" },
        { key: "familyMemberId", label: "Person", type: "select", options: memberOptions },
        { key: "amount", label: "Betrag (optional)", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monatlich" },
            { value: "quarterly", label: "quartalsweise" },
            { value: "yearly", label: "jährlich" },
          ],
        },
        { key: "startOn", label: "Startdatum", type: "date" },
        { key: "endOn", label: "Enddatum", type: "date" },
        { key: "cancelByOn", label: "Kündigen bis", type: "date" },
        { key: "noticeText", label: "Hinweis" },
      ],
      initial: {
        name: "",
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

    try {
      await api.post("/api/subscriptions", {
        name: String(values.name).trim(),
        provider: null,
        amount: parseNumber(values.amount),
        currency: "EUR",
        cadence: String(values.cadence),
        renewsOn: String(values.startOn).trim() || today(),
        cancelByOn: String(values.cancelByOn).trim() || null,
        noticePeriodDays: null,
        isActive: true,
        notes: withContractMeta(null, {
          familyMemberId: String(values.familyMemberId ?? ""),
          startOn: String(values.startOn ?? ""),
          endOn: String(values.endOn ?? ""),
          noticeText: String(values.noticeText ?? ""),
        }),
      });
      contracts.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editContract(s: Subscription) {
    const meta = parseContractMeta(s.notes);
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Vertrag bearbeiten",
      submitText: "Speichern",
      fields: [
        { key: "name", label: "Vertrag" },
        { key: "familyMemberId", label: "Person", type: "select", options: memberOptions },
        { key: "amount", label: "Betrag (optional)", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monatlich" },
            { value: "quarterly", label: "quartalsweise" },
            { value: "yearly", label: "jährlich" },
          ],
        },
        { key: "startOn", label: "Startdatum", type: "date" },
        { key: "endOn", label: "Enddatum", type: "date" },
        { key: "cancelByOn", label: "Kündigen bis", type: "date" },
        { key: "noticeText", label: "Hinweis" },
      ],
      initial: {
        name: s.name,
        familyMemberId: meta.familyMemberId,
        amount: String(s.amount),
        cadence: s.cadence,
        startOn: meta.startOn,
        endOn: meta.endOn,
        cancelByOn: s.cancelByOn ?? "",
        noticeText: meta.noticeText,
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/subscriptions/${s.id}`, {
        ...s,
        name: String(values.name).trim(),
        provider: null,
        amount: parseNumber(values.amount),
        cadence: String(values.cadence),
        renewsOn: String(values.startOn).trim() || s.renewsOn,
        cancelByOn: String(values.cancelByOn).trim() || null,
        noticePeriodDays: null,
        notes: withContractMeta(s.notes, {
          familyMemberId: String(values.familyMemberId ?? ""),
          startOn: String(values.startOn ?? ""),
          endOn: String(values.endOn ?? ""),
          noticeText: String(values.noticeText ?? ""),
        }),
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
        lede="Verträge, Laufzeiten und Hinweise im Blick."
      />
      <ErrorBar message={error ?? contracts.error ?? members.error} />

      <Section title="Verträge" action={<button className="btn icon-only" aria-label="Vertrag hinzufügen" title="Vertrag hinzufügen" onClick={addContract}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Vertrag hinzufügen</span></button>}>
        {rows.length === 0
          ? <Empty title="Noch keine Verträge." hint="Lege Verträge mit Startdatum, Enddatum und Kündigungsfrist an." />
          : <div className="card">
              <div className="table-scroll contracts-scroll contracts-desktop">
                <table className="contracts-table">
                  <thead><tr><th>Vertrag</th><th>Person</th><th className="num">Betrag</th><th>Turnus</th><th>Startdatum</th><th>Enddatum</th><th>Kündigen bis</th><th>Hinweis</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {rows.map(({ s, memberName, startOn, endOn, note }) => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td>{memberName}</td>
                        <td className="num">{euro(s.amount, s.currency)}</td>
                        <td>{cadenceLabel(s.cadence)}</td>
                        <td>{shortDate(startOn || null)}</td>
                        <td>{shortDate(endOn || null)}</td>
                        <td>{shortDate(s.cancelByOn)}</td>
                        <td>{note || "-"}</td>
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
                {rows.map(({ s, memberName, startOn, endOn, note }) => (
                  <div key={`m-${s.id}`} className="contracts-mobile-card">
                    <div className="contracts-mobile-head">
                      <strong>{s.name}</strong>
                      <span className="badge">{euro(s.amount, s.currency)}</span>
                    </div>
                    <div className="alert-msg">{memberName} · {cadenceLabel(s.cadence)}</div>
                    <div className="contracts-mobile-grid">
                      <span>Start: {shortDate(startOn || null)}</span>
                      <span>Ende: {shortDate(endOn || null)}</span>
                      <span>Kündigen bis: {shortDate(s.cancelByOn)}</span>
                      <span>Hinweis: {note || "-"}</span>
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
