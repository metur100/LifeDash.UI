import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { FixedCost, Income, Payment, Subscription } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section, Stat } from "../components/Ui";
import { countdown, daysUntil, euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const monthly = (amount: number, cadence: string) => {
  if (cadence === "yearly") return amount / 12;
  if (cadence === "quarterly") return amount / 3;
  if (cadence === "onetime") return 0;
  return amount;
};

const yearly = (amount: number, cadence: string) => {
  if (cadence === "monthly") return amount * 12;
  if (cadence === "quarterly") return amount * 4;
  if (cadence === "yearly") return amount;
  return amount;
};

const cadenceLabel: Record<string, string> = {
  monthly: "monatlich",
  quarterly: "quartalsweise",
  yearly: "j\u00E4hrlich",
  onetime: "einmalig",
};

const COST_CATEGORY_OPTIONS = [
  { value: "miete", label: "Miete" },
  { value: "nebenkosten", label: "Nebenkosten" },
  { value: "strom", label: "Strom" },
  { value: "dsl", label: "DSL/Internet" },
  { value: "abo", label: "Abo" },
  { value: "vertrag", label: "Vertrag" },
  { value: "versicherung", label: "Versicherung" },
  { value: "steuer", label: "Steuer" },
  { value: "auto", label: "Auto" },
  { value: "gesundheit", label: "Gesundheit" },
  { value: "lebensmittel", label: "Lebensmittel" },
  { value: "sonstiges", label: "Sonstiges" },
];

function categoryOptions(current?: string | null) {
  const value = String(current ?? "").trim();
  if (!value) return COST_CATEGORY_OPTIONS;
  if (COST_CATEGORY_OPTIONS.some((x) => x.value === value)) return COST_CATEGORY_OPTIONS;
  return [{ value, label: value }, ...COST_CATEGORY_OPTIONS];
}

type CostLine = {
  key: string;
  source: "fixed" | "subscription";
  id: number;
  name: string;
  category: string;
  amount: number;
  currency: string;
  cadence: string;
  isActive: boolean;
  dayOfMonth?: number | null;
  renewsOn?: string | null;
  cancelByOn?: string | null;
};

type UpcomingItem = {
  key: string;
  source: "payment" | "fixed" | "subscription";
  id: number;
  title: string;
  category: string;
  amount: number;
  currency: string;
  dueOn: string;
  payment?: Payment;
};

const parseNumber = (value: unknown) => Number(String(value ?? "0").replace(",", "."));
const parseOptionalDay = (value: unknown) => {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const day = base.getDate();
  const first = new Date(y, m + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
}

function addDays(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextDateForDay(dayOfMonth: number, fromIso = today()): string {
  const from = new Date(`${fromIso}T00:00:00`);
  const currentYear = from.getFullYear();
  const currentMonth = from.getMonth();
  const maxThisMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const safeDayThisMonth = Math.min(dayOfMonth, maxThisMonth);
  const candidate = new Date(currentYear, currentMonth, safeDayThisMonth);
  if (candidate >= from) return candidate.toISOString().slice(0, 10);

  const nextMonth = new Date(currentYear, currentMonth + 1, 1);
  const maxNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(dayOfMonth, maxNextMonth)).toISOString().slice(0, 10);
}

function nextSubscriptionDue(sub: Subscription, fromIso = today()): string {
  const from = new Date(`${fromIso}T00:00:00`);
  let due = new Date(`${sub.renewsOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return fromIso;

  if (sub.cadence === "monthly") {
    while (due < from) due = addMonthsClamped(due, 1);
  } else if (sub.cadence === "quarterly") {
    while (due < from) due = addMonthsClamped(due, 3);
  } else if (sub.cadence === "yearly") {
    while (due < from) due = addMonthsClamped(due, 12);
  }

  return due.toISOString().slice(0, 10);
}

function monthId(iso: string): string {
  return iso.slice(0, 7);
}

function currentYear(iso = today()): number {
  return Number(iso.slice(0, 4));
}

function withinDays(targetIso: string, daysAhead: number): boolean {
  const now = new Date(`${today()}T00:00:00`);
  const target = new Date(`${targetIso}T00:00:00`);
  const max = new Date(`${addDays(today(), daysAhead)}T00:00:00`);
  return target >= now && target <= max;
}

export default function Finance() {
  const incomes = useAsync<Income[]>(() => api.get("/api/incomes"), []);
  const costs = useAsync<FixedCost[]>(() => api.get("/api/fixed-costs"), []);
  const subs = useAsync<Subscription[]>(() => api.get("/api/subscriptions"), []);
  const payments = useAsync<Payment[]>(() => api.get("/api/payments"), []);
  const dialog = useDialog();

  const [error, setError] = useState<string | null>(null);

  const subById = useMemo(() => new Map((subs.data ?? []).map((s) => [s.id, s])), [subs.data]);
  const costById = useMemo(() => new Map((costs.data ?? []).map((c) => [c.id, c])), [costs.data]);

  const costLines = useMemo<CostLine[]>(() => {
    const fixed = (costs.data ?? []).map((c) => ({
      key: `fixed-${c.id}`,
      source: "fixed" as const,
      id: c.id,
      name: c.name,
      category: c.category?.trim() || "Fixkosten",
      amount: c.amount,
      currency: c.currency,
      cadence: c.cadence,
      isActive: c.isActive,
      dayOfMonth: c.dayOfMonth,
      renewsOn: null,
      cancelByOn: null,
    }));

    const contracts = (subs.data ?? []).map((s) => ({
      key: `sub-${s.id}`,
      source: "subscription" as const,
      id: s.id,
      name: s.name,
      category: s.provider?.trim() || "Abo/Vertrag",
      amount: s.amount,
      currency: s.currency,
      cadence: s.cadence,
      isActive: s.isActive,
      dayOfMonth: null,
      renewsOn: s.renewsOn,
      cancelByOn: s.cancelByOn,
    }));

    return [...fixed, ...contracts].sort((a, b) => a.name.localeCompare(b.name));
  }, [costs.data, subs.data]);

  const overview = useMemo(() => {
    const activeIncome = (incomes.data ?? []).filter((i) => i.isActive);
    const activeCosts = costLines.filter((c) => c.isActive);

    const monthIncome = activeIncome.reduce((s, i) => s + monthly(i.amount, i.cadence), 0);
    const yearIncome = activeIncome.reduce((s, i) => s + yearly(i.amount, i.cadence), 0);
    const monthCosts = activeCosts.reduce((s, c) => s + monthly(c.amount, c.cadence), 0);
    const yearCosts = activeCosts.reduce((s, c) => s + yearly(c.amount, c.cadence), 0);

    const currentMonthId = monthId(today());
    const year = currentYear();

    const openPayments = (payments.data ?? []).filter((p) => !p.isPaid);
    const dueThisMonth = openPayments
      .filter((p) => monthId(p.dueOn) === currentMonthId)
      .reduce((s, p) => s + p.amount, 0);

    const oneTimeThisYear = openPayments
      .filter((p) => Number(p.dueOn.slice(0, 4)) === year)
      .reduce((s, p) => s + p.amount, 0);

    const leftMonth = monthIncome - monthCosts - dueThisMonth;
    const leftYear = yearIncome - yearCosts - oneTimeThisYear;

    const saveMonth = Math.max(0, leftMonth);
    const saveYear = Math.max(0, leftYear);

    return {
      monthIncome,
      yearIncome,
      monthCosts,
      yearCosts,
      leftMonth,
      leftYear,
      saveMonth,
      saveYear,
    };
  }, [incomes.data, costLines, payments.data]);

  const upcoming = useMemo<UpcomingItem[]>(() => {
    const allPayments = payments.data ?? [];
    const existsAsPayment = (x: { title: string; dueOn: string; category: string; amount: number }) =>
      allPayments.some((p) =>
        p.title === x.title &&
        p.dueOn === x.dueOn &&
        (p.category ?? "") === x.category &&
        Math.abs(p.amount - x.amount) < 0.005,
      );

    const openManual = (payments.data ?? [])
      .filter((p) => !p.isPaid)
      .map((p) => ({
        key: `pay-${p.id}`,
        source: "payment" as const,
        id: p.id,
        title: p.title,
        category: p.category ?? "Einmalige Zahlung",
        amount: p.amount,
        currency: p.currency,
        dueOn: p.dueOn,
        payment: p,
      }));

    const fixedPlanned = (costs.data ?? [])
      .filter((c) => c.isActive && !!c.dayOfMonth)
      .map((c) => ({
        key: `fixed-next-${c.id}`,
        source: "fixed" as const,
        id: c.id,
        title: c.name,
        category: c.category?.trim() || "Fixkosten",
        amount: c.amount,
        currency: c.currency,
        dueOn: nextDateForDay(c.dayOfMonth as number),
      }))
      .filter((x) => !existsAsPayment(x))
      .filter((x) => withinDays(x.dueOn, 40));

    const subPlanned = (subs.data ?? [])
      .filter((s) => s.isActive)
      .map((s) => ({
        key: `sub-next-${s.id}`,
        source: "subscription" as const,
        id: s.id,
        title: s.name,
        category: s.provider?.trim() || "Abo/Vertrag",
        amount: s.amount,
        currency: s.currency,
        dueOn: nextSubscriptionDue(s),
      }))
      .filter((x) => !existsAsPayment(x))
      .filter((x) => withinDays(x.dueOn, 40));

    return [...openManual, ...fixedPlanned, ...subPlanned].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }, [payments.data, costs.data, subs.data]);

  const paid = useMemo(() => (payments.data ?? [])
    .filter((p) => p.isPaid)
    .sort((a, b) => (b.paidOn ?? b.dueOn).localeCompare(a.paidOn ?? a.dueOn)), [payments.data]);

  async function markPaid(p: Payment) {
    try {
      await api.put(`/api/payments/${p.id}`, { ...p, isPaid: true, paidOn: today() });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markUnpaid(p: Payment) {
    try {
      await api.put(`/api/payments/${p.id}`, { ...p, isPaid: false, paidOn: null });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editPayment(p: Payment) {
    const values = await dialog.form({
      title: "Zahlung bearbeiten",
      fields: [
        { key: "title", label: "Titel" },
        { key: "amount", label: "Betrag", type: "number" },
        { key: "dueOn", label: "F\u00E4llig am", type: "date" },
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
        amount: parseNumber(values.amount),
        dueOn: String(values.dueOn),
        category: String(values.category).trim() || null,
      });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removePayment(id: number) {
    const ok = await dialog.confirm({
      title: "Zahlung l\u00F6schen",
      message: "Zahlung wirklich l\u00F6schen?",
      confirmText: "L\u00F6schen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/payments/${id}`);
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addManualPayment() {
    const values = await dialog.form({
      title: "Einmalige Zahlung anlegen",
      fields: [
        { key: "title", label: "Titel" },
        { key: "amount", label: "Betrag", type: "number" },
        { key: "dueOn", label: "F\u00E4llig am", type: "date" },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        title: "",
        amount: "",
        dueOn: today(),
        category: "",
      },
      submitText: "Anlegen",
    });
    if (!values) return;

    const title = String(values.title).trim();
    const amount = parseNumber(values.amount);
    if (!title || !Number.isFinite(amount) || amount <= 0) return;

    try {
      await api.post("/api/payments", {
        title,
        amount,
        dueOn: String(values.dueOn),
        category: String(values.category).trim() || null,
        currency: "EUR",
        isPaid: false,
      });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markProjectedPaid(item: UpcomingItem) {
    try {
      await api.post("/api/payments", {
        title: item.title,
        amount: item.amount,
        dueOn: item.dueOn,
        category: item.category,
        currency: item.currency,
        isPaid: true,
        paidOn: today(),
      });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleIncome(i: Income) {
    try {
      await api.put(`/api/incomes/${i.id}`, { ...i, isActive: !i.isActive });
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleCost(c: FixedCost) {
    try {
      await api.put(`/api/fixed-costs/${c.id}`, { ...c, isActive: !c.isActive });
      costs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleSubscription(s: Subscription) {
    try {
      await api.put(`/api/subscriptions/${s.id}`, { ...s, isActive: !s.isActive });
      subs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
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
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
        { key: "dayOfMonth", label: "Eingangstag (1-31, optional)", type: "number" },
      ],
      initial: {
        source: i.source,
        amount: String(i.amount),
        cadence: i.cadence,
        dayOfMonth: i.dayOfMonth ? String(i.dayOfMonth) : "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/incomes/${i.id}`, {
        ...i,
        source: String(values.source).trim(),
        amount: parseNumber(values.amount),
        cadence: String(values.cadence),
        dayOfMonth: parseOptionalDay(values.dayOfMonth),
      });
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeIncome(id: number) {
    const ok = await dialog.confirm({
      title: "Einnahme l\u00F6schen",
      message: "Einnahme wirklich l\u00F6schen?",
      confirmText: "L\u00F6schen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/incomes/${id}`);
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addIncome() {
    const values = await dialog.form({
      title: "Einnahme anlegen",
      fields: [
        { key: "source", label: "Quelle" },
        { key: "amount", label: "Betrag", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monthly" },
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
        { key: "dayOfMonth", label: "Eingangstag (1-31, optional)", type: "number" },
      ],
      initial: {
        source: "",
        amount: "",
        cadence: "monthly",
        dayOfMonth: "",
      },
      submitText: "Anlegen",
    });
    if (!values) return;

    const source = String(values.source).trim();
    const amount = parseNumber(values.amount);
    if (!source || !Number.isFinite(amount) || amount <= 0) return;

    try {
      await api.post("/api/incomes", {
        source,
        amount,
        cadence: String(values.cadence),
        dayOfMonth: parseOptionalDay(values.dayOfMonth),
        currency: "EUR",
        isActive: true,
      });
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
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
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
        { key: "dayOfMonth", label: "Zahltag (1-31, optional)", type: "number" },
        { key: "category", label: "Kategorie", type: "select", options: categoryOptions(c.category) },
      ],
      initial: {
        name: c.name,
        amount: String(c.amount),
        cadence: c.cadence,
        dayOfMonth: c.dayOfMonth ? String(c.dayOfMonth) : "",
        category: c.category ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/fixed-costs/${c.id}`, {
        ...c,
        name: String(values.name).trim(),
        amount: parseNumber(values.amount),
        cadence: String(values.cadence),
        dayOfMonth: parseOptionalDay(values.dayOfMonth),
        category: String(values.category).trim() || null,
      });
      costs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeCost(id: number) {
    const ok = await dialog.confirm({
      title: "Fixkosten l\u00F6schen",
      message: "Fixkosten-Eintrag wirklich l\u00F6schen?",
      confirmText: "L\u00F6schen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/fixed-costs/${id}`);
      costs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editSubscription(s: Subscription) {
    const values = await dialog.form({
      title: "Vertrag bearbeiten",
      fields: [
        { key: "name", label: "Name" },
        { key: "amount", label: "Betrag", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monthly" },
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
          ],
        },
        { key: "renewsOn", label: "F\u00E4llig/Verl\u00E4ngerung", type: "date" },
        { key: "cancelByOn", label: "K\u00FCndigen bis", type: "date" },
        { key: "provider", label: "Kategorie", type: "select", options: categoryOptions(s.provider) },
      ],
      initial: {
        name: s.name,
        amount: String(s.amount),
        cadence: s.cadence,
        renewsOn: s.renewsOn,
        cancelByOn: s.cancelByOn ?? "",
        provider: s.provider ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/subscriptions/${s.id}`, {
        ...s,
        name: String(values.name).trim(),
        amount: parseNumber(values.amount),
        cadence: String(values.cadence),
        renewsOn: String(values.renewsOn),
        cancelByOn: String(values.cancelByOn).trim() || null,
        provider: String(values.provider).trim() || null,
      });
      subs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeSubscription(id: number) {
    const ok = await dialog.confirm({
      title: "Vertrag l\u00F6schen",
      message: "Vertrag wirklich l\u00F6schen?",
      confirmText: "L\u00F6schen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/subscriptions/${id}`);
      subs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addRunningCost() {
    const values = await dialog.form({
      title: "Laufenden Kostenpunkt anlegen",
      fields: [
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "fixed", label: "Fixkosten" },
            { value: "subscription", label: "Abo/Vertrag" },
          ],
        },
        { key: "name", label: "Name" },
        { key: "amount", label: "Betrag", type: "number" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "monthly", label: "monthly" },
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
            { value: "onetime", label: "onetime" },
          ],
        },
        { key: "dayOfMonth", label: "Zahltag (1-31, nur Fixkosten)", type: "number" },
        { key: "renewsOn", label: "F\u00E4lligkeitsdatum (Abo/Vertrag)", type: "date" },
        { key: "cancelByOn", label: "K\u00FCndigen bis (Abo/Vertrag)", type: "date" },
        { key: "category", label: "Kategorie", type: "select", options: categoryOptions("sonstiges") },
      ],
      initial: {
        kind: "fixed",
        name: "",
        amount: "",
        cadence: "monthly",
        dayOfMonth: "",
        renewsOn: today(),
        cancelByOn: "",
        category: "",
      },
      submitText: "Anlegen",
    });
    if (!values) return;

    const kind = String(values.kind);
    const name = String(values.name).trim();
    const amount = parseNumber(values.amount);
    const cadence = String(values.cadence);
    const category = String(values.category).trim() || null;
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    try {
      if (kind === "subscription") {
        await api.post("/api/subscriptions", {
          name,
          amount,
          cadence: cadence === "onetime" ? "yearly" : cadence,
          renewsOn: String(values.renewsOn || today()),
          cancelByOn: String(values.cancelByOn).trim() || null,
          provider: category,
          currency: "EUR",
          isActive: true,
        });
      } else {
        await api.post("/api/fixed-costs", {
          name,
          amount,
          cadence,
          dayOfMonth: parseOptionalDay(values.dayOfMonth),
          category,
          currency: "EUR",
          isActive: true,
        });
      }
      costs.reload();
      subs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Finanzen"
        title="Jahresblick und Monatsplan"
        lede="Einnahmen, laufende Kosten und anstehende Zahlungen in einer Ansicht."
      />
      <ErrorBar message={error ?? incomes.error ?? costs.error ?? subs.error ?? payments.error} />

      <div className="stats finance-stats">
        <Stat label="Einnahmen / Monat" value={euro(overview.monthIncome)} />
        <Stat label="Einnahmen / Jahr" value={euro(overview.yearIncome)} />
        <Stat label="Laufende Kosten / Monat" value={euro(overview.monthCosts)} />
        <Stat label="Laufende Kosten / Jahr" value={euro(overview.yearCosts)} />
        <Stat label="Bleibt \u00FCbrig / Monat" value={euro(overview.leftMonth)} tone={overview.leftMonth < 0 ? "neg" : "pos"} />
        <Stat label="Bleibt \u00FCbrig / Jahr" value={euro(overview.leftYear)} tone={overview.leftYear < 0 ? "neg" : "pos"} />
        <Stat label="Sparen m\u00F6glich / Monat" value={euro(overview.saveMonth)} tone="pos" />
        <Stat label="Sparen m\u00F6glich / Jahr" value={euro(overview.saveYear)} tone="pos" />
      </div>

      <Section
        title="Anstehende Zahlungen"
        action={
          <button className="btn icon-only" aria-label="Einmalige Zahlung anlegen" title="Einmalige Zahlung anlegen" onClick={addManualPayment}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Einmalige Zahlung anlegen</span>
          </button>
        }
      >
        <div className="card">
          {upcoming.length === 0 ? (
            <Empty title="Nichts offen." hint="Es gibt aktuell keine anstehenden Zahlungen." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Posten</th>
                    <th>Herkunft</th>
                    <th>F\u00E4llig</th>
                    <th className="num">Betrag</th>
                    <th className="num">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((item) => {
                    const d = daysUntil(item.dueOn);
                    return (
                      <tr key={item.key}>
                        <td>
                          <strong>{item.title}</strong>
                          <div className="alert-msg">{item.category}</div>
                        </td>
                        <td>
                          <span className="badge">
                            {item.source === "payment" ? "einmalig" : item.source === "fixed" ? "Fixkosten" : "Abo/Vertrag"}
                          </span>
                        </td>
                        <td>
                          {shortDate(item.dueOn)}{" "}
                          <span className={`badge ${d !== null && d < 0 ? "red" : d !== null && d <= 7 ? "amber" : ""}`}>
                            {countdown(d)}
                          </span>
                        </td>
                        <td className="num">{euro(item.amount, item.currency)}</td>
                        <td className="num">
                          {item.source === "payment" ? (
                            <>
                              <button className="btn ghost small icon-only" aria-label="Als bezahlt markieren" title="Als bezahlt markieren" onClick={() => markPaid(item.payment as Payment)}>
                                <i className="fa-solid fa-circle-check" aria-hidden />
                                <span className="sr-only">Bezahlt</span>
                              </button>{" "}
                              <button className="btn ghost small icon-only" aria-label="Zahlung bearbeiten" title="Zahlung bearbeiten" onClick={() => editPayment(item.payment as Payment)}>
                                <i className="fa-solid fa-pen-to-square" aria-hidden />
                                <span className="sr-only">Bearbeiten</span>
                              </button>{" "}
                              <button className="btn danger small icon-only" aria-label="Zahlung l\u00F6schen" title="Zahlung l\u00F6schen" onClick={() => removePayment(item.id)}>
                                <i className="fa-solid fa-trash" aria-hidden />
                                <span className="sr-only">L\u00F6schen</span>
                              </button>
                            </>
                          ) : item.source === "fixed" ? (
                            <>
                              <button className="btn ghost small icon-only" aria-label="Als bezahlt markieren" title="Als bezahlt markieren" onClick={() => markProjectedPaid(item)}>
                                <i className="fa-solid fa-circle-check" aria-hidden />
                                <span className="sr-only">Bezahlt</span>
                              </button>{" "}
                              <button className="btn ghost small icon-only" aria-label="Fixkosten bearbeiten" title="Fixkosten bearbeiten" onClick={() => {
                                const c = costById.get(item.id);
                                if (c) void editCost(c);
                              }}>
                                <i className="fa-solid fa-pen-to-square" aria-hidden />
                                <span className="sr-only">Bearbeiten</span>
                              </button>{" "}
                              <button className="btn danger small icon-only" aria-label="Fixkosten löschen" title="Fixkosten löschen" onClick={() => removeCost(item.id)}>
                                <i className="fa-solid fa-trash" aria-hidden />
                                <span className="sr-only">Löschen</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn ghost small icon-only" aria-label="Als bezahlt markieren" title="Als bezahlt markieren" onClick={() => markProjectedPaid(item)}>
                                <i className="fa-solid fa-circle-check" aria-hidden />
                                <span className="sr-only">Bezahlt</span>
                              </button>{" "}
                              <button className="btn ghost small icon-only" aria-label="Vertrag bearbeiten" title="Vertrag bearbeiten" onClick={() => {
                                const s = subById.get(item.id);
                                if (s) void editSubscription(s);
                              }}>
                                <i className="fa-solid fa-pen-to-square" aria-hidden />
                                <span className="sr-only">Bearbeiten</span>
                              </button>{" "}
                              <button className="btn danger small icon-only" aria-label="Vertrag löschen" title="Vertrag löschen" onClick={() => removeSubscription(item.id)}>
                                <i className="fa-solid fa-trash" aria-hidden />
                                <span className="sr-only">Löschen</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Laufende Kosten"
        action={
          <button className="btn icon-only" aria-label="Kostenpunkt anlegen" title="Kostenpunkt anlegen" onClick={addRunningCost}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Kostenpunkt anlegen</span>
          </button>
        }
      >
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Posten</th>
                  <th>Turnus</th>
                  <th>Zahlungsinfo</th>
                  <th className="num">Monat</th>
                  <th className="num">Jahr</th>
                  <th className="num">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {costLines.map((line) => {
                  const cancel = daysUntil(line.cancelByOn);
                  return (
                    <tr key={line.key}>
                      <td>
                        <strong>{line.name}</strong>
                        <div className="alert-msg">{line.category} | {line.isActive ? "aktiv" : "pausiert"}</div>
                      </td>
                      <td>{cadenceLabel[line.cadence] ?? line.cadence}</td>
                      <td>
                        {line.source === "fixed"
                          ? (line.dayOfMonth ? `jeden ${line.dayOfMonth}.` : "kein Zahltag")
                          : (line.cancelByOn ? `kündigen bis ${shortDate(line.cancelByOn)} (${countdown(cancel)})` : `f\u00E4llig am ${shortDate(line.renewsOn)}`)}
                      </td>
                      <td className="num">{euro(monthly(line.amount, line.cadence), line.currency)}</td>
                      <td className="num">{euro(yearly(line.amount, line.cadence), line.currency)}</td>
                      <td className="num">
                        {line.source === "fixed" ? (
                          <>
                            <button className="btn ghost small icon-only" aria-label={line.isActive ? "Fixkosten pausieren" : "Fixkosten aktivieren"} title={line.isActive ? "Fixkosten pausieren" : "Fixkosten aktivieren"} onClick={() => {
                              const c = costById.get(line.id);
                              if (c) void toggleCost(c);
                            }}>
                              <i className={`fa-solid ${line.isActive ? "fa-toggle-on" : "fa-toggle-off"}`} aria-hidden />
                              <span className="sr-only">Status</span>
                            </button>{" "}
                            <button className="btn ghost small icon-only" aria-label="Fixkosten bearbeiten" title="Fixkosten bearbeiten" onClick={() => {
                              const c = costById.get(line.id);
                              if (c) void editCost(c);
                            }}>
                              <i className="fa-solid fa-pen-to-square" aria-hidden />
                              <span className="sr-only">Bearbeiten</span>
                            </button>{" "}
                            <button className="btn danger small icon-only" aria-label="Fixkosten l\u00F6schen" title="Fixkosten l\u00F6schen" onClick={() => removeCost(line.id)}>
                              <i className="fa-solid fa-trash" aria-hidden />
                              <span className="sr-only">L\u00F6schen</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn ghost small icon-only" aria-label={line.isActive ? "Vertrag pausieren" : "Vertrag aktivieren"} title={line.isActive ? "Vertrag pausieren" : "Vertrag aktivieren"} onClick={() => {
                              const s = subById.get(line.id);
                              if (s) void toggleSubscription(s);
                            }}>
                              <i className={`fa-solid ${line.isActive ? "fa-toggle-on" : "fa-toggle-off"}`} aria-hidden />
                              <span className="sr-only">Status</span>
                            </button>{" "}
                            <button className="btn ghost small icon-only" aria-label="Vertrag bearbeiten" title="Vertrag bearbeiten" onClick={() => {
                              const s = subById.get(line.id);
                              if (s) void editSubscription(s);
                            }}>
                              <i className="fa-solid fa-pen-to-square" aria-hidden />
                              <span className="sr-only">Bearbeiten</span>
                            </button>{" "}
                            <button className="btn danger small icon-only" aria-label="Vertrag l\u00F6schen" title="Vertrag l\u00F6schen" onClick={() => removeSubscription(line.id)}>
                              <i className="fa-solid fa-trash" aria-hidden />
                              <span className="sr-only">L\u00F6schen</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Zahlungshistorie"
        action={
          <button className="btn icon-only" aria-label="Einmalige Zahlung anlegen" title="Einmalige Zahlung anlegen" onClick={addManualPayment}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Einmalige Zahlung anlegen</span>
          </button>
        }
      >
        <div className="card">
          {paid.length === 0 ? (
            <Empty title="Noch keine bezahlten Zahlungen." hint="Sobald du eine Zahlung als bezahlt markierst, erscheint sie hier." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Zahlung</th>
                    <th>F\u00E4llig</th>
                    <th>Bezahlt am</th>
                    <th className="num">Betrag</th>
                    <th className="num">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.title}</strong></td>
                      <td>{shortDate(p.dueOn)}</td>
                      <td>{shortDate(p.paidOn)}</td>
                      <td className="num">{euro(p.amount, p.currency)}</td>
                      <td className="num">
                        <button className="btn ghost small icon-only" aria-label="Als offen markieren" title="Als offen markieren" onClick={() => markUnpaid(p)}>
                          <i className="fa-solid fa-rotate-left" aria-hidden />
                          <span className="sr-only">Offen</span>
                        </button>{" "}
                        <button className="btn ghost small icon-only" aria-label="Zahlung bearbeiten" title="Zahlung bearbeiten" onClick={() => editPayment(p)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Zahlung l\u00F6schen" title="Zahlung l\u00F6schen" onClick={() => removePayment(p.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">L\u00F6schen</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Einnahmen"
        action={
          <button className="btn icon-only" aria-label="Einnahme anlegen" title="Einnahme anlegen" onClick={addIncome}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Einnahme anlegen</span>
          </button>
        }
      >
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Quelle</th>
                  <th>Turnus</th>
                  <th>Eingangstag</th>
                  <th className="num">Monat</th>
                  <th className="num">Jahr</th>
                  <th className="num">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {(incomes.data ?? []).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.source}</strong>
                      <div className="alert-msg">{i.isActive ? "aktiv" : "pausiert"}</div>
                    </td>
                    <td>{cadenceLabel[i.cadence] ?? i.cadence}</td>
                    <td>{i.dayOfMonth ? `jeden ${i.dayOfMonth}.` : "-"}</td>
                    <td className="num">{euro(monthly(i.amount, i.cadence), i.currency)}</td>
                    <td className="num">{euro(yearly(i.amount, i.cadence), i.currency)}</td>
                    <td className="num">
                      <button className="btn ghost small icon-only" aria-label={i.isActive ? "Einnahme pausieren" : "Einnahme aktivieren"} title={i.isActive ? "Einnahme pausieren" : "Einnahme aktivieren"} onClick={() => toggleIncome(i)}>
                        <i className={`fa-solid ${i.isActive ? "fa-toggle-on" : "fa-toggle-off"}`} aria-hidden />
                        <span className="sr-only">Status</span>
                      </button>{" "}
                      <button className="btn ghost small icon-only" aria-label="Einnahme bearbeiten" title="Einnahme bearbeiten" onClick={() => editIncome(i)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>{" "}
                      <button className="btn danger small icon-only" aria-label="Einnahme l\u00F6schen" title="Einnahme l\u00F6schen" onClick={() => removeIncome(i.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">L\u00F6schen</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </>
  );
}