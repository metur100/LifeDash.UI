import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { SavingsEntry, SavingsKind } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Pager, Section, Stat, usePaged } from "../components/Ui";
import { euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

function toNum(value: unknown): number {
  return Number(String(value ?? "0").replace(",", "."));
}

const kindLabels: Record<SavingsKind, string> = { deposit: "Einzahlung", withdrawal: "Entnahme" };

const signed = (e: SavingsEntry) => (e.kind === "withdrawal" ? -e.amount : e.amount);

export default function Savings() {
  const entries = useAsync<SavingsEntry[]>(() => api.get("/api/savings-entries"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  // Oldest first to compute the running balance, then flipped so the newest movement is on top.
  const history = useMemo(() => {
    const sorted = [...(entries.data ?? [])].sort((a, b) =>
      a.entryDate.localeCompare(b.entryDate) || a.id - b.id);
    let running = 0;
    return sorted.map((e) => ({ entry: e, balanceAfter: (running += signed(e)) })).reverse();
  }, [entries.data]);

  const deposited = (entries.data ?? []).filter((e) => e.kind === "deposit").reduce((s, e) => s + e.amount, 0);
  const withdrawn = (entries.data ?? []).filter((e) => e.kind === "withdrawal").reduce((s, e) => s + e.amount, 0);
  const balance = deposited - withdrawn;
  const historyPaged = usePaged(history);

  async function addEntry(kind: SavingsKind) {
    const values = await dialog.form({
      title: kind === "deposit" ? "Geld einzahlen" : "Geld entnehmen",
      submitText: kind === "deposit" ? "Einzahlen" : "Entnehmen",
      fields: [
        { key: "amount", label: "Betrag (€)", type: "number" },
        { key: "entryDate", label: "Datum", type: "date" },
        { key: "note", label: kind === "deposit" ? "Notiz" : "Wofür?" },
      ],
      initial: { amount: "", entryDate: today(), note: "" },
    });
    if (!values) return;

    const amount = toNum(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      await api.post("/api/savings-entries", {
        kind,
        amount,
        currency: "EUR",
        entryDate: String(values.entryDate).trim() || today(),
        note: String(values.note).trim() || null,
      });
      entries.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editEntry(e: SavingsEntry) {
    const values = await dialog.form({
      title: "Eintrag bearbeiten",
      submitText: "Speichern",
      fields: [
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: (Object.keys(kindLabels) as SavingsKind[]).map((k) => ({ value: k, label: kindLabels[k] })),
        },
        { key: "amount", label: "Betrag (€)", type: "number" },
        { key: "entryDate", label: "Datum", type: "date" },
        { key: "note", label: "Notiz" },
      ],
      initial: { kind: e.kind, amount: e.amount.toString(), entryDate: e.entryDate, note: e.note ?? "" },
    });
    if (!values) return;

    const amount = toNum(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      await api.put(`/api/savings-entries/${e.id}`, {
        ...e,
        kind: String(values.kind),
        amount,
        entryDate: String(values.entryDate).trim() || e.entryDate,
        note: String(values.note).trim() || null,
      });
      entries.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeEntry(id: number) {
    const ok = await dialog.confirm({
      title: "Eintrag löschen",
      message: "Diese Bewegung wirklich löschen? Der Stand wird neu berechnet.",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/savings-entries/${id}`);
      entries.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const actions = (e: SavingsEntry) => (
    <>
      <button className="btn ghost small icon-only" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten" onClick={() => editEntry(e)}>
        <i className="fa-solid fa-pen-to-square" aria-hidden />
        <span className="sr-only">Bearbeiten</span>
      </button>
      <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeEntry(e.id)}>
        <i className="fa-solid fa-trash" aria-hidden />
        <span className="sr-only">Löschen</span>
      </button>
    </>
  );

  const amountBadge = (e: SavingsEntry) => (
    <span className={`badge ${e.kind === "withdrawal" ? "red" : "green"}`}>
      {e.kind === "withdrawal" ? "−" : "+"}{euro(e.amount, e.currency)}
    </span>
  );

  return (
    <>
      <PageHead
        eyebrow="Ersparnisse"
        title="Bargeld-Rücklagen"
        lede="Wie viel Geld du beiseitegelegt hast – und was nach jeder Entnahme noch übrig ist."
        action={<>
          <button className="btn icon-only" aria-label="Geld einzahlen" title="Geld einzahlen" onClick={() => addEntry("deposit")}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Geld einzahlen</span>
          </button>{" "}
          <button className="btn ghost icon-only" aria-label="Geld entnehmen" title="Geld entnehmen" onClick={() => addEntry("withdrawal")}>
            <i className="fa-solid fa-minus" aria-hidden />
            <span className="sr-only">Geld entnehmen</span>
          </button>
        </>}
      />
      <ErrorBar message={error ?? entries.error} />

      <div className="stats">
        <Stat label="Aktueller Stand" value={euro(balance)} tone={balance < 0 ? "neg" : "pos"}
          note={history[0] ? `zuletzt geändert ${shortDate(history[0].entry.entryDate)}` : "noch keine Bewegungen"} />
        <Stat label="Eingezahlt" value={euro(deposited)} />
        <Stat label="Entnommen" value={euro(withdrawn)} />
      </div>

      <Section title="Verlauf">
        <div className="card">
          {history.length === 0 ? (
            <Empty title="Noch keine Ersparnisse erfasst." hint="Trage über das Plus ein, wie viel Bargeld du gerade hast." />
          ) : (
            <>
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Bewegung</th>
                      <th className="num">Betrag</th>
                      <th className="num">Stand danach</th>
                      <th className="num action-col">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyPaged.pageItems.map(({ entry: e, balanceAfter }) => (
                      <tr key={e.id}>
                        <td>{shortDate(e.entryDate)}</td>
                        <td>
                          <strong>{kindLabels[e.kind]}</strong>
                          {e.note && <div className="alert-msg">{e.note}</div>}
                        </td>
                        <td className="num">{amountBadge(e)}</td>
                        <td className="num">{euro(balanceAfter, e.currency)}</td>
                        <td className="num action-cell"><div className="action-stack">{actions(e)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rtable-cards">
                {historyPaged.pageItems.map(({ entry: e, balanceAfter }) => (
                  <div key={`m-${e.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{kindLabels[e.kind]}</strong>
                      {amountBadge(e)}
                    </div>
                    {e.note && <div className="alert-msg">{e.note}</div>}
                    <div className="alert-msg">{shortDate(e.entryDate)} · Stand danach {euro(balanceAfter, e.currency)}</div>
                    <div className="action-stack mobile-card-actions">{actions(e)}</div>
                  </div>
                ))}
              </div>
              <Pager paged={historyPaged} />
            </>
          )}
        </div>
      </Section>
    </>
  );
}
