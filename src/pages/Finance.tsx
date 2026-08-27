import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { FixedCost, Income, Payment, Subscription } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section, Stat } from "../components/Ui";
import { countdown, daysUntil, euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const monthly = (amount: number, cadence: string) =>
  cadence === "yearly" ? amount / 12 : cadence === "quarterly" ? amount / 3 : amount;

export default function Finance() {
  const incomes = useAsync<Income[]>(() => api.get("/api/incomes"), []);
  const costs = useAsync<FixedCost[]>(() => api.get("/api/fixed-costs"), []);
  const subs = useAsync<Subscription[]>(() => api.get("/api/subscriptions"), []);
  const payments = useAsync<Payment[]>(() => api.get("/api/payments"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState({ title: "", amount: "", dueOn: today() });

  const totals = useMemo(() => {
    const inc = (incomes.data ?? []).filter((i) => i.isActive)
      .reduce((s, i) => s + monthly(i.amount, i.cadence), 0);
    const fix = (costs.data ?? []).filter((c) => c.isActive)
      .reduce((s, c) => s + monthly(c.amount, c.cadence), 0);
    const sub = (subs.data ?? []).filter((s2) => s2.isActive)
      .reduce((s, x) => s + monthly(x.amount, x.cadence), 0);
    return { inc, fix, sub, rest: inc - fix - sub };
  }, [incomes.data, costs.data, subs.data]);

  async function markPaid(p: Payment) {
    try {
      await api.put(`/api/payments/${p.id}`, { ...p, isPaid: true, paidOn: today() });
      payments.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editPayment(p: Payment) {
    const values = await dialog.form({
      title: "Zahlung bearbeiten",
      fields: [
        { key: "title", label: "Titel" },
        { key: "amount", label: "Betrag", type: "number" },
        { key: "dueOn", label: "Fällig am", type: "date" },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        title: p.title,
        amount: String(p.amount),
        dueOn: p.dueOn,
        category: p.category ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/payments/${p.id}`, {
        ...p,
        title: String(values.title).trim(),
        amount: Number(values.amount),
        dueOn: String(values.dueOn),
        category: String(values.category).trim() || null,
      });
      payments.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removePayment(id: number) {
    const ok = await dialog.confirm({ title: "Zahlung löschen", message: "Zahlung wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/payments/${id}`);
      payments.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editIncome(i: Income) {
    const values = await dialog.form({
      title: "Einnahme bearbeiten",
      fields: [
        { key: "source", label: "Quelle" },
        { key: "amount", label: "Betrag", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monthly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
      ],
      initial: { source: i.source, amount: String(i.amount), cadence: i.cadence },
    });
    if (!values) return;
    try {
      await api.put(`/api/incomes/${i.id}`, {
        ...i,
        source: String(values.source).trim(),
        amount: Number(values.amount),
        cadence: String(values.cadence),
      });
      incomes.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeIncome(id: number) {
    const ok = await dialog.confirm({ title: "Einnahme löschen", message: "Einnahme wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/incomes/${id}`);
      incomes.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editCost(c: FixedCost) {
    const values = await dialog.form({
      title: "Fixkosten bearbeiten",
      fields: [
        { key: "name", label: "Name" },
        { key: "amount", label: "Betrag", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monthly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
        { key: "category", label: "Kategorie" },
      ],
      initial: { name: c.name, amount: String(c.amount), cadence: c.cadence, category: c.category ?? "" },
    });
    if (!values) return;
    try {
      await api.put(`/api/fixed-costs/${c.id}`, {
        ...c,
        name: String(values.name).trim(),
        amount: Number(values.amount),
        cadence: String(values.cadence),
        category: String(values.category).trim() || null,
      });
      costs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeCost(id: number) {
    const ok = await dialog.confirm({ title: "Fixkosten löschen", message: "Fixkosten-Eintrag wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/fixed-costs/${id}`);
      costs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editSubscription(s: Subscription) {
    const values = await dialog.form({
      title: "Abo bearbeiten",
      fields: [
        { key: "name", label: "Abo" },
        { key: "amount", label: "Betrag", type: "number" },
        { key: "renewsOn", label: "Verlängert am", type: "date" },
        { key: "cancelByOn", label: "Kündigen bis", type: "date" },
      ],
      initial: {
        name: s.name,
        amount: String(s.amount),
        renewsOn: s.renewsOn,
        cancelByOn: s.cancelByOn ?? "",
      },
    });
    if (!values) return;
    try {
      await api.put(`/api/subscriptions/${s.id}`, {
        ...s,
        name: String(values.name).trim(),
        amount: Number(values.amount),
        renewsOn: String(values.renewsOn),
        cancelByOn: String(values.cancelByOn).trim() || null,
      });
      subs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeSubscription(id: number) {
    const ok = await dialog.confirm({ title: "Abo löschen", message: "Abo wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/subscriptions/${id}`);
      subs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addPayment(e: FormEvent) {
    e.preventDefault();
    if (!newPayment.title.trim() || !newPayment.amount) return;
    try {
      await api.post("/api/payments", {
        title: newPayment.title,
        amount: Number(newPayment.amount),
        dueOn: newPayment.dueOn,
        currency: "EUR",
        isPaid: false,
      });
      setNewPayment({ title: "", amount: "", dueOn: today() });
      payments.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const open = (payments.data ?? []).filter((p) => !p.isPaid)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  return (
    <>
      <PageHead eyebrow="Finanzen" title="Was rein- und rausgeht"
        lede="Einnahmen, Fixkosten, Abos und anstehende Zahlungen — inklusive Kündigungsfristen." />
      <ErrorBar message={error ?? incomes.error ?? subs.error} />

      <div className="stats">
        <Stat label="Einnahmen / Monat" value={euro(totals.inc)} />
        <Stat label="Fixkosten" value={euro(totals.fix)} />
        <Stat label="Abos" value={euro(totals.sub)} note={`${(subs.data ?? []).filter(s => s.isActive).length} aktiv`} />
        <Stat label="Bleibt übrig" value={euro(totals.rest)} tone={totals.rest < 0 ? "neg" : "pos"} />
      </div>

      <Section title="Anstehende Zahlungen">
        <div className="card">
          {open.length === 0
            ? <Empty title="Nichts offen." hint="Alle erfassten Zahlungen sind erledigt." />
            : <table>
                <thead><tr><th>Zahlung</th><th>Fällig</th><th className="num">Betrag</th><th className="num">Aktion</th></tr></thead>
                <tbody>
                  {open.map((p) => {
                    const d = daysUntil(p.dueOn);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.title}</strong>
                          {p.category && <span className="badge" style={{ marginLeft: 8 }}>{p.category}</span>}
                        </td>
                        <td>
                          {shortDate(p.dueOn)}{" "}
                          <span className={`badge ${d !== null && d < 0 ? "red" : d !== null && d <= 7 ? "amber" : ""}`}>
                            {countdown(d)}
                          </span>
                        </td>
                        <td className="num">{euro(p.amount, p.currency)}</td>
                        <td className="num">
                          <button className="btn ghost small icon-only" aria-label="Als bezahlt markieren" title="Als bezahlt markieren" onClick={() => markPaid(p)}>
                            <i className="fa-solid fa-circle-check" aria-hidden />
                            <span className="sr-only">Bezahlt</span>
                          </button>{" "}
                          <button className="btn ghost small icon-only" aria-label="Zahlung bearbeiten" title="Zahlung bearbeiten" onClick={() => editPayment(p)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Zahlung löschen" title="Zahlung löschen" onClick={() => removePayment(p.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>}

          <form className="form-grid" style={{ marginTop: 16 }} onSubmit={addPayment}>
            <label className="field">Bezeichnung
              <input value={newPayment.title} required
                     onChange={(e) => setNewPayment({ ...newPayment, title: e.target.value })} />
            </label>
            <label className="field">Betrag
              <input type="number" step="0.01" value={newPayment.amount} required
                     onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} />
            </label>
            <label className="field">Fällig am
              <input type="date" value={newPayment.dueOn}
                     onChange={(e) => setNewPayment({ ...newPayment, dueOn: e.target.value })} />
            </label>
            <label className="field">&nbsp;
              <button className="btn icon-only" aria-label="Zahlung erfassen" title="Zahlung erfassen">
                <i className="fa-solid fa-plus" aria-hidden />
                <span className="sr-only">Zahlung erfassen</span>
              </button>
            </label>
          </form>
        </div>
      </Section>

      <Section title="Abos und Verträge">
        <div className="card">
          <table>
            <thead>
              <tr><th>Abo</th><th>Turnus</th><th>Verlängert am</th><th>Kündigen bis</th><th className="num">Betrag</th><th className="num">Aktion</th></tr>
            </thead>
            <tbody>
              {(subs.data ?? []).map((s) => {
                const cancel = daysUntil(s.cancelByOn);
                return (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong>{s.provider && <div className="alert-msg">{s.provider}</div>}</td>
                    <td>{s.cadence}</td>
                    <td>{shortDate(s.renewsOn)}</td>
                    <td>
                      {s.cancelByOn
                        ? <span className={`badge ${cancel !== null && cancel <= 14 ? "red" : "amber"}`}>
                            {shortDate(s.cancelByOn)} · {countdown(cancel)}
                          </span>
                        : "jederzeit"}
                    </td>
                    <td className="num">{euro(s.amount, s.currency)}</td>
                    <td className="num">
                      <button className="btn ghost small icon-only" aria-label="Abo bearbeiten" title="Abo bearbeiten" onClick={() => editSubscription(s)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>{" "}
                      <button className="btn danger small icon-only" aria-label="Abo löschen" title="Abo löschen" onClick={() => removeSubscription(s.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Einnahmen">
          <div className="card">
            <table>
              <thead><tr><th>Quelle</th><th className="num">Betrag</th><th className="num">Aktion</th></tr></thead>
              <tbody>
                {(incomes.data ?? []).map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.source}</strong><div className="alert-msg">{i.cadence}</div></td>
                    <td className="num">{euro(i.amount, i.currency)}</td>
                    <td className="num">
                      <button className="btn ghost small icon-only" aria-label="Einnahme bearbeiten" title="Einnahme bearbeiten" onClick={() => editIncome(i)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>{" "}
                      <button className="btn danger small icon-only" aria-label="Einnahme löschen" title="Einnahme löschen" onClick={() => removeIncome(i.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Fixkosten">
          <div className="card">
            <table>
              <thead><tr><th>Name</th><th className="num">Betrag</th><th className="num">Aktion</th></tr></thead>
              <tbody>
                {(costs.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><div className="alert-msg">{c.category ?? "sonstige"}</div></td>
                    <td className="num">{euro(c.amount, c.currency)}</td>
                    <td className="num">
                      <button className="btn ghost small icon-only" aria-label="Fixkosten bearbeiten" title="Fixkosten bearbeiten" onClick={() => editCost(c)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>{" "}
                      <button className="btn danger small icon-only" aria-label="Fixkosten löschen" title="Fixkosten löschen" onClick={() => removeCost(c.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
