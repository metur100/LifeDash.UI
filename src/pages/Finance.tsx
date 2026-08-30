import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  yearly: "jährlich",
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
  { value: "online-kaeufe", label: "Online-Käufe" },
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
  id: number;
  name: string;
  category: string;
  amount: number;
  currency: string;
  cadence: string;
  isActive: boolean;
  dayOfMonth?: number | null;
};

type UpcomingItem = {
  key: string;
  source: "payment" | "fixed";
  id: number;
  title: string;
  category: string;
  amount: number;
  currency: string;
  dueOn: string;
  payment?: Payment;
  cadence?: string;
};

type FixedCostMeta = {
  billingDate: string | null;
  costType: "fixed" | "variable";
};

type PaymentMeta = {
  cadence: string;
  anchorDate: string | null;
};

const parseNumber = (value: unknown) => Number(String(value ?? "0").replace(",", "."));

const FINANCE_META_START = "[finance-meta]";
const FINANCE_META_END = "[/finance-meta]";
const PAYMENT_META_START = "[payment-meta]";
const PAYMENT_META_END = "[/payment-meta]";
const INCOME_META_START = "[income-meta]";
const INCOME_META_END = "[/income-meta]";

type IncomeMeta = {
  anchorDate: string | null;
};

function parseMetaBlock(notes: string | null | undefined, startTag: string, endTag: string) {
  const text = notes ?? "";
  const start = text.indexOf(startTag);
  const end = text.indexOf(endTag);
  if (start < 0 || end < 0 || end <= start) return { values: new Map<string, string>(), plain: text.trim() };

  const raw = text.slice(start + startTag.length, end).trim();
  const values = new Map<string, string>();
  for (const line of raw.split("\n").map((x) => x.trim()).filter(Boolean)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  const before = text.slice(0, start).trim();
  const after = text.slice(end + endTag.length).trim();
  const plain = [before, after].filter(Boolean).join("\n\n").trim();
  return { values, plain };
}

function writeMetaBlock(notes: string | null | undefined, startTag: string, endTag: string, entries: Array<[string, string | null]>) {
  const parsed = parseMetaBlock(notes, startTag, endTag);
  const lines = entries
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}:${String(value)}`);

  if (lines.length === 0) return parsed.plain || null;

  const block = `${startTag}\n${lines.join("\n")}\n${endTag}`;
  return parsed.plain ? `${parsed.plain}\n\n${block}` : block;
}

function parseFixedCostMeta(notes?: string | null): FixedCostMeta {
  const parsed = parseMetaBlock(notes, FINANCE_META_START, FINANCE_META_END);
  const billingDate = parsed.values.get("billingDate") ?? null;
  const costTypeRaw = (parsed.values.get("costType") ?? "fixed").toLowerCase();
  const costType = costTypeRaw === "variable" ? "variable" : "fixed";
  return { billingDate, costType };
}

function withFixedCostMeta(notes: string | null | undefined, meta: FixedCostMeta): string | null {
  return writeMetaBlock(notes, FINANCE_META_START, FINANCE_META_END, [
    ["billingDate", meta.billingDate],
    ["costType", meta.costType === "variable" ? "variable" : null],
  ]);
}

function parsePaymentMeta(notes?: string | null, dueOn?: string): PaymentMeta {
  const parsed = parseMetaBlock(notes, PAYMENT_META_START, PAYMENT_META_END);
  const cadenceRaw = (parsed.values.get("cadence") ?? "onetime").toLowerCase();
  const cadence = cadenceRaw === "monthly" || cadenceRaw === "quarterly" || cadenceRaw === "yearly"
    ? cadenceRaw
    : "onetime";
  const anchorDate = parsed.values.get("anchorDate") ?? dueOn ?? null;
  return { cadence, anchorDate };
}

function withPaymentMeta(notes: string | null | undefined, meta: PaymentMeta): string | null {
  return writeMetaBlock(notes, PAYMENT_META_START, PAYMENT_META_END, [
    ["cadence", meta.cadence],
    ["anchorDate", meta.anchorDate],
  ]);
}

function parseIncomeMeta(notes?: string | null): IncomeMeta {
  const parsed = parseMetaBlock(notes, INCOME_META_START, INCOME_META_END);
  return {
    anchorDate: parsed.values.get("anchorDate") ?? null,
  };
}

function withIncomeMeta(notes: string | null | undefined, meta: IncomeMeta): string | null {
  return writeMetaBlock(notes, INCOME_META_START, INCOME_META_END, [
    ["anchorDate", meta.anchorDate],
  ]);
}

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

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
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

function addCadence(iso: string, cadence: string): string {
  const date = parseIsoDate(iso);
  const months = cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : cadence === "yearly" ? 12 : 0;
  if (months <= 0) return iso;
  return addMonthsClamped(date, months).toISOString().slice(0, 10);
}

function nextDueFromAnchor(anchorIso: string, cadence: string, fromIso = today()): string {
  if (cadence !== "monthly" && cadence !== "quarterly" && cadence !== "yearly") return anchorIso;

  let due = anchorIso;
  let guard = 0;
  while (due < fromIso && guard < 240) {
    due = addCadence(due, cadence);
    guard += 1;
  }
  return due;
}

function nextIncomeDate(i: Income, fromIso = today()): string | null {
  const meta = parseIncomeMeta(i.notes);
  const anchor = meta.anchorDate;

  if (i.cadence === "onetime") {
    if (!anchor) return null;
    return anchor >= fromIso ? anchor : null;
  }

  if (anchor && (i.cadence === "monthly" || i.cadence === "quarterly" || i.cadence === "yearly")) {
    return nextDueFromAnchor(anchor, i.cadence, fromIso);
  }

  if (i.dayOfMonth) {
    return nextDateForDay(i.dayOfMonth, fromIso);
  }

  return anchor;
}

function monthId(iso: string): string {
  return iso.slice(0, 7);
}

const UPCOMING_HORIZON_DAYS = 400;

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

  const costById = useMemo(() => new Map((costs.data ?? []).map((c) => [c.id, c])), [costs.data]);

  const costLines = useMemo<CostLine[]>(() => {
    return (costs.data ?? []).map((c) => ({
      key: `fixed-${c.id}`,
      id: c.id,
      name: c.name,
      category: c.category?.trim() || "Fixkosten",
      amount: c.amount,
      currency: c.currency,
      cadence: c.cadence,
      isActive: c.isActive,
      dayOfMonth: c.dayOfMonth,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [costs.data]);

  const activeContracts = useMemo(
    () => (subs.data ?? []).filter((s) => s.isActive && s.flowType !== "none"),
    [subs.data],
  );

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

    const contractCosts = activeContracts.filter((s) => s.flowType === "cost");
    const contractIncomes = activeContracts.filter((s) => s.flowType === "income");
    const contractCostMonthly = contractCosts.reduce((s, c) => s + monthly(c.amount ?? 0, c.cadence), 0);
    const contractCostYearly = contractCosts.reduce((s, c) => s + yearly(c.amount ?? 0, c.cadence), 0);
    const contractIncomeMonthly = contractIncomes.reduce((s, c) => s + monthly(c.amount ?? 0, c.cadence), 0);
    const contractIncomeYearly = contractIncomes.reduce((s, c) => s + yearly(c.amount ?? 0, c.cadence), 0);

    const leftMonth = monthIncome + contractIncomeMonthly - monthCosts - contractCostMonthly - dueThisMonth;
    const leftYear = yearIncome + contractIncomeYearly - yearCosts - contractCostYearly - oneTimeThisYear;

    return {
      monthIncome,
      yearIncome,
      monthCosts,
      yearCosts,
      contractCostMonthly,
      contractIncomeMonthly,
      leftMonth,
      leftYear,
    };
  }, [incomes.data, costLines, payments.data, activeContracts]);

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
      .map((c) => {
        const meta = parseFixedCostMeta(c.notes);
        const fallbackAnchor = nextDateForDay(c.dayOfMonth as number);
        const anchor = meta.billingDate ?? fallbackAnchor;
        const dueOn = c.cadence === "monthly" || c.cadence === "quarterly" || c.cadence === "yearly"
          ? nextDueFromAnchor(anchor, c.cadence)
          : nextDateForDay(c.dayOfMonth as number);
        return {
        key: `fixed-next-${c.id}`,
        source: "fixed" as const,
        id: c.id,
        title: c.name,
        category: c.category?.trim() || "Fixkosten",
        amount: c.amount,
        currency: c.currency,
          dueOn,
          cadence: c.cadence,
        };
      })
      .filter((x) => !existsAsPayment(x))
      .filter((x) => withinDays(x.dueOn, UPCOMING_HORIZON_DAYS));

    return [...openManual, ...fixedPlanned].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  }, [payments.data, costs.data]);

  const paid = useMemo(() => (payments.data ?? [])
    .filter((p) => p.isPaid)
    .sort((a, b) => (b.paidOn ?? b.dueOn).localeCompare(a.paidOn ?? a.dueOn)), [payments.data]);

  async function markPaid(p: Payment) {
    try {
      const meta = parsePaymentMeta(p.notes, p.dueOn);
      if (meta.cadence !== "onetime") {
        let nextDue = addCadence(p.dueOn, meta.cadence);
        while (nextDue <= today()) {
          nextDue = addCadence(nextDue, meta.cadence);
        }
        const hasNext = (payments.data ?? []).some((x) =>
          !x.isPaid &&
          x.title === p.title &&
          (x.category ?? "") === (p.category ?? "") &&
          x.dueOn === nextDue &&
          Math.abs(x.amount - p.amount) < 0.005,
        );

        if (!hasNext) {
          await api.post("/api/payments", {
            title: p.title,
            amount: p.amount,
            dueOn: nextDue,
            category: p.category,
            currency: p.currency,
            isPaid: false,
            notes: withPaymentMeta(p.notes, { cadence: meta.cadence, anchorDate: meta.anchorDate ?? p.dueOn }),
          });
        }
      }

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
        { key: "dueOn", label: "Fällig am", type: "date" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "onetime", label: "einmalig" },
            { value: "monthly", label: "monthly" },
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
          ],
        },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        cadence: parsePaymentMeta(p.notes, p.dueOn).cadence,
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
        notes: withPaymentMeta(p.notes, {
          cadence: String(values.cadence),
          anchorDate: String(values.dueOn),
        }),
      });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removePayment(id: number) {
    const ok = await dialog.confirm({
      title: "Zahlung löschen",
      message: "Zahlung wirklich löschen?",
      confirmText: "Löschen",
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
      title: "Zahlung anlegen",
      fields: [
        { key: "title", label: "Titel" },
        { key: "amount", label: "Betrag", type: "number" },
        { key: "dueOn", label: "Fällig am", type: "date" },
        {
          key: "cadence",
          label: "Turnus",
          type: "select",
          options: [
            { value: "onetime", label: "einmalig" },
            { value: "monthly", label: "monthly" },
            { value: "quarterly", label: "quarterly" },
            { value: "yearly", label: "yearly" },
          ],
        },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        title: "",
        amount: "",
        dueOn: today(),
        cadence: "onetime",
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
        notes: withPaymentMeta(null, {
          cadence: String(values.cadence),
          anchorDate: String(values.dueOn),
        }),
      });
      payments.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markProjectedPaid(item: UpcomingItem) {
    try {
      const cadence = item.cadence ?? "onetime";
      if (cadence === "monthly" || cadence === "quarterly" || cadence === "yearly") {
        let nextDue = addCadence(item.dueOn, cadence);
        while (nextDue <= today()) {
          nextDue = addCadence(nextDue, cadence);
        }

        const hasNext = (payments.data ?? []).some((p) =>
          !p.isPaid &&
          p.title === item.title &&
          (p.category ?? "") === (item.category ?? "") &&
          p.dueOn === nextDue &&
          Math.abs(p.amount - item.amount) < 0.005,
        );

        if (!hasNext) {
          await api.post("/api/payments", {
            title: item.title,
            amount: item.amount,
            dueOn: nextDue,
            category: item.category,
            currency: item.currency,
            isPaid: false,
            notes: withPaymentMeta(null, {
              cadence,
              anchorDate: item.dueOn,
            }),
          });
        }
      }

      await api.post("/api/payments", {
        title: item.title,
        amount: item.amount,
        dueOn: item.dueOn,
        category: item.category,
        currency: item.currency,
        isPaid: true,
        paidOn: today(),
        notes: withPaymentMeta(null, {
          cadence: item.cadence ?? "onetime",
          anchorDate: item.dueOn,
        }),
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

  async function editIncome(i: Income) {
    const meta = parseIncomeMeta(i.notes);
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
        { key: "anchorDate", label: "Einnahmedatum", type: "date" },
      ],
      initial: {
        source: i.source,
        amount: String(i.amount),
        cadence: i.cadence,
        anchorDate: meta.anchorDate ?? "",
      },
    });
    if (!values) return;

    try {
      const cadence = String(values.cadence);
      const anchorDate = String(values.anchorDate ?? "").trim() || null;
      if (cadence === "onetime" && !anchorDate) {
        setError("Für einmalige Einnahmen bitte ein Datum setzen.");
        return;
      }

      await api.put(`/api/incomes/${i.id}`, {
        ...i,
        source: String(values.source).trim(),
        amount: parseNumber(values.amount),
        cadence,
        dayOfMonth: null,
        notes: withIncomeMeta(i.notes, {
          anchorDate,
        }),
      });
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeIncome(id: number) {
    const ok = await dialog.confirm({
      title: "Einnahme löschen",
      message: "Einnahme wirklich löschen?",
      confirmText: "Löschen",
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
        { key: "anchorDate", label: "Einnahmedatum", type: "date" },
      ],
      initial: {
        source: "",
        amount: "",
        cadence: "monthly",
        anchorDate: "",
      },
      submitText: "Anlegen",
    });
    if (!values) return;

    const source = String(values.source).trim();
    const amount = parseNumber(values.amount);
    const cadence = String(values.cadence);
    const anchorDate = String(values.anchorDate ?? "").trim() || null;
    if (!source || !Number.isFinite(amount) || amount <= 0) return;
    if (cadence === "onetime" && !anchorDate) {
      setError("Für einmalige Einnahmen bitte ein Datum setzen.");
      return;
    }

    try {
      await api.post("/api/incomes", {
        source,
        amount,
        cadence,
        dayOfMonth: null,
        currency: "EUR",
        isActive: true,
        notes: withIncomeMeta(null, {
          anchorDate,
        }),
      });
      incomes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editCost(c: FixedCost) {
    const meta = parseFixedCostMeta(c.notes);
    const kindInitial = meta.costType === "variable" || (!meta.billingDate && !c.dayOfMonth)
      ? "variable"
      : "fixed";

    const values = await dialog.form({
      title: "Kostenpunkt bearbeiten",
      fields: [
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "fixed", label: "Fixkosten" },
            { value: "variable", label: "Variable" },
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
        {
          key: "billingDate",
          label: "Zahlungsdatum",
          type: "date",
          visibleWhen: (draft) => String(draft.kind ?? "fixed") === "fixed",
        },
        { key: "category", label: "Kategorie", type: "select", options: categoryOptions(c.category) },
      ],
      initial: {
        kind: kindInitial,
        name: c.name,
        amount: String(c.amount),
        cadence: c.cadence,
        billingDate: meta.billingDate ?? "",
        category: c.category ?? "",
      },
    });
    if (!values) return;

    try {
      const kind = String(values.kind) === "variable" ? "variable" : "fixed";
      const billingDate = kind === "fixed"
        ? (String(values.billingDate ?? "").trim() || null)
        : null;

      if (kind === "fixed" && !billingDate) {
        setError("Für Fixkosten bitte ein Zahlungsdatum wählen.");
        return;
      }

      const safeDay = kind === "fixed" && billingDate
        ? parseIsoDate(billingDate).getDate()
        : null;

      await api.put(`/api/fixed-costs/${c.id}`, {
        ...c,
        name: String(values.name).trim(),
        amount: parseNumber(values.amount),
        cadence: String(values.cadence),
        dayOfMonth: safeDay,
        category: String(values.category).trim() || null,
        notes: withFixedCostMeta(c.notes, {
          billingDate,
          costType: kind,
        }),
      });
      costs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeCost(id: number) {
    const ok = await dialog.confirm({
      title: "Fixkosten löschen",
      message: "Fixkosten-Eintrag wirklich löschen?",
      confirmText: "Löschen",
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

  async function addRunningCost() {
    const values = await dialog.form({
      title: "Laufenden Kostenpunkt anlegen",
      fields: [
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "variable", label: "Variable" },
            { value: "fixed", label: "Fixkosten" },
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
          ],
        },
        {
          key: "billingDate",
          label: "Zahlungsdatum",
          type: "date",
          visibleWhen: (draft) => String(draft.kind ?? "") === "fixed",
        },
        { key: "category", label: "Kategorie", type: "select", options: categoryOptions("sonstiges") },
      ],
      initial: {
        kind: "variable",
        name: "",
        amount: "",
        cadence: "monthly",
        billingDate: "",
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

    const billingDate = kind === "fixed"
      ? String(values.billingDate ?? "").trim() || null
      : null;
    if (kind === "fixed" && !billingDate) {
      setError("Für Fixkosten bitte ein Zahlungsdatum wählen.");
      return;
    }

    try {
      await api.post("/api/fixed-costs", {
        name,
        amount,
        cadence,
        dayOfMonth: billingDate ? parseIsoDate(billingDate).getDate() : null,
        category,
        currency: "EUR",
        isActive: true,
        notes: withFixedCostMeta(null, {
          billingDate,
          costType: kind === "variable" ? "variable" : "fixed",
        }),
      });
      costs.reload();
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
        <Stat className="wide" label="Bleibt übrig / Monat" value={euro(overview.leftMonth)} tone={overview.leftMonth < 0 ? "neg" : "pos"} />
        <Stat className="wide" label="Bleibt übrig / Jahr" value={euro(overview.leftYear)} tone={overview.leftYear < 0 ? "neg" : "pos"} />
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
            <div className="table-scroll finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Posten</th>
                    <th className="hide-phone">Herkunft</th>
                    <th>Fällig</th>
                    <th className="num">Betrag</th>
                    <th className="num action-col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((item) => {
                    const d = daysUntil(item.dueOn);
                    return (
                      <tr key={item.key}>
                        <td>
                          <strong>{item.title}</strong>
                          <div className="alert-msg compact-mobile">{item.category}</div>
                        </td>
                        <td className="hide-phone">
                          <span className="badge">
                            {item.source === "payment"
                              ? (cadenceLabel[parsePaymentMeta(item.payment?.notes, item.dueOn).cadence] ?? "einmalig")
                              : `Fixkosten · ${cadenceLabel[item.cadence ?? "monthly"] ?? item.cadence}`}
                          </span>
                        </td>
                        <td>
                          {shortDate(item.dueOn)}{" "}
                          <span className={`badge ${d !== null && d < 0 ? "red" : d !== null && d <= 7 ? "amber" : ""}`}>
                            {countdown(d)}
                          </span>
                        </td>
                        <td className="num">{euro(item.amount, item.currency)}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
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
                              <button className="btn danger small icon-only" aria-label="Zahlung löschen" title="Zahlung löschen" onClick={() => removePayment(item.id)}>
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
                          )}
                          </div>
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
          <div className="table-scroll finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Posten</th>
                  <th>Turnus</th>
                  <th className="hide-phone">Zahlungsinfo</th>
                  <th className="num">Monat</th>
                  <th className="num hide-phone">Jahr</th>
                  <th className="num action-col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {costLines.map((line) => {
                  const fixedMeta = parseFixedCostMeta(costById.get(line.id)?.notes);
                  return (
                    <tr key={line.key}>
                      <td>
                        <strong>{line.name}</strong>
                        <div className="alert-msg compact-mobile">{line.category} | {line.isActive ? "aktiv" : "pausiert"}</div>
                      </td>
                      <td>{cadenceLabel[line.cadence] ?? line.cadence}</td>
                      <td className="hide-phone">
                        {(() => {
                          if (fixedMeta?.costType === "variable") return "Variable";
                          const anchor = fixedMeta?.billingDate;
                          if (!anchor || !line.dayOfMonth) return "kein Zahltag";
                          const label = cadenceLabel[line.cadence] ?? line.cadence;
                          return `${shortDate(anchor)} · ${label}`;
                        })()}
                      </td>
                      <td className="num">{euro(monthly(line.amount, line.cadence), line.currency)}</td>
                      <td className="num hide-phone">{euro(yearly(line.amount, line.cadence), line.currency)}</td>
                      <td className="num action-cell">
                        <div className="action-stack">
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
                          <button className="btn danger small icon-only" aria-label="Fixkosten löschen" title="Fixkosten löschen" onClick={() => removeCost(line.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                        </div>
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
        title="Verträge"
        action={<Link className="btn ghost small" to="/contracts">Verträge verwalten</Link>}
      >
        <div className="card">
          {activeContracts.length === 0 ? (
            <Empty title="Keine Verträge mit Zahlung." hint="Verträge legst du unter Verträge und Kündigungen an — hier erscheinen nur die mit Kosten oder Einnahme." />
          ) : (
            <div className="table-scroll finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Vertrag</th>
                    <th>Art</th>
                    <th>Turnus</th>
                    <th className="num">Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {activeContracts.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td><span className="badge">{s.flowType === "income" ? "Einnahme" : "Kosten"}</span></td>
                      <td>{cadenceLabel[s.cadence] ?? s.cadence}</td>
                      <td className="num">{euro(monthly(s.amount ?? 0, s.cadence), s.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="auth-hint" style={{ marginTop: 10 }}>
            {overview.contractIncomeMonthly > 0 && `+${euro(overview.contractIncomeMonthly)} Einnahme`}
            {overview.contractIncomeMonthly > 0 && overview.contractCostMonthly > 0 && " · "}
            {overview.contractCostMonthly > 0 && `-${euro(overview.contractCostMonthly)} Kosten`}
            {" "}pro Monat aus Verträgen — bereits in „Bleibt übrig" eingerechnet.
          </p>
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
            <div className="table-scroll finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Zahlung</th>
                    <th>Fällig</th>
                    <th className="hide-phone">Bezahlt am</th>
                    <th className="num">Betrag</th>
                    <th className="num action-col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.title}</strong></td>
                      <td>{shortDate(p.dueOn)}</td>
                      <td className="hide-phone">{shortDate(p.paidOn)}</td>
                      <td className="num">{euro(p.amount, p.currency)}</td>
                      <td className="num action-cell">
                        <div className="action-stack">
                        <button className="btn ghost small icon-only" aria-label="Als offen markieren" title="Als offen markieren" onClick={() => markUnpaid(p)}>
                          <i className="fa-solid fa-rotate-left" aria-hidden />
                          <span className="sr-only">Offen</span>
                        </button>{" "}
                        <button className="btn ghost small icon-only" aria-label="Zahlung bearbeiten" title="Zahlung bearbeiten" onClick={() => editPayment(p)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Zahlung löschen" title="Zahlung löschen" onClick={() => removePayment(p.id)}>
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
          <div className="table-scroll finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Quelle</th>
                  <th>Turnus</th>
                  <th className="hide-phone">Nächste Einnahme</th>
                  <th className="num">Monat</th>
                  <th className="num hide-phone">Jahr</th>
                  <th className="num action-col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {(incomes.data ?? []).map((i) => {
                  const nextIncome = nextIncomeDate(i);
                  return (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.source}</strong>
                      <div className="alert-msg compact-mobile">{i.isActive ? "aktiv" : "pausiert"}</div>
                    </td>
                    <td>{cadenceLabel[i.cadence] ?? i.cadence}</td>
                    <td className="hide-phone">{nextIncome ? shortDate(nextIncome) : "-"}</td>
                    <td className="num">{euro(monthly(i.amount, i.cadence), i.currency)}</td>
                    <td className="num hide-phone">{euro(yearly(i.amount, i.cadence), i.currency)}</td>
                    <td className="num action-cell">
                      <div className="action-stack">
                      <button className="btn ghost small icon-only" aria-label={i.isActive ? "Einnahme pausieren" : "Einnahme aktivieren"} title={i.isActive ? "Einnahme pausieren" : "Einnahme aktivieren"} onClick={() => toggleIncome(i)}>
                        <i className={`fa-solid ${i.isActive ? "fa-toggle-on" : "fa-toggle-off"}`} aria-hidden />
                        <span className="sr-only">Status</span>
                      </button>{" "}
                      <button className="btn ghost small icon-only" aria-label="Einnahme bearbeiten" title="Einnahme bearbeiten" onClick={() => editIncome(i)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>{" "}
                      <button className="btn danger small icon-only" aria-label="Einnahme löschen" title="Einnahme löschen" onClick={() => removeIncome(i.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </>
  );
}