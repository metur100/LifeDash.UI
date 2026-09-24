import type { Appointment } from "../api/types";
import { today } from "./format";

// Repeating appointments: startsAt is the series anchor and every occurrence is
// computed from it (occurrence n = anchor + n steps, never "previous + 1 step",
// so a monthly series on the 31st doesn't drift to the 28th after February).
// Mirrors the API's Services/AppointmentRecurrence.cs.

export type Recurrence = "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

export const RECURRENCE_OPTIONS: Array<{ value: "" | Recurrence; label: string }> = [
  { value: "", label: "Keine" },
  { value: "daily", label: "täglich" },
  { value: "weekly", label: "wöchentlich" },
  { value: "biweekly", label: "alle 2 Wochen" },
  { value: "monthly", label: "monatlich" },
  { value: "yearly", label: "jährlich" },
];

const MAX_STEPS = 20000;
const FIXED_STEP_DAYS: Partial<Record<Recurrence, number>> = { daily: 1, weekly: 7, biweekly: 14 };

export function normalizeRecurrence(value: unknown): Recurrence | null {
  const key = String(value ?? "").trim().toLowerCase();
  return RECURRENCE_OPTIONS.some((o) => o.value && o.value === key) ? (key as Recurrence) : null;
}

export function recurrenceLabel(value: unknown): string | null {
  const rule = normalizeRecurrence(value);
  return rule ? RECURRENCE_OPTIONS.find((o) => o.value === rule)!.label : null;
}

// Appointment times are zone-less local strings ("2026-09-24T10:00:00"); parse the
// parts by hand so nothing gets shifted through UTC.
function parseLocal(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

function formatLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function nth(anchor: Date, rule: Recurrence, n: number): Date {
  const fixed = FIXED_STEP_DAYS[rule];
  if (fixed) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + fixed * n);
    return d;
  }
  const months = rule === "monthly" ? n : 12 * n;
  const first = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(anchor.getDate(), lastDay),
    anchor.getHours(), anchor.getMinutes(), anchor.getSeconds());
}

/** Start times (local ISO strings) of every occurrence whose date lies in [fromIso, toIso]. */
export function occurrencesBetween(a: Appointment, fromIso: string, toIso: string): string[] {
  const rule = normalizeRecurrence(a.recurrence);
  if (!rule) {
    const day = a.startsAt.slice(0, 10);
    return day >= fromIso && day <= toIso ? [a.startsAt] : [];
  }

  const anchor = parseLocal(a.startsAt);
  const until = a.recurrenceUntil && a.recurrenceUntil < toIso ? a.recurrenceUntil : toIso;
  const out: string[] = [];

  // Jump close to the window for fixed-length steps instead of walking from the anchor.
  let n = 0;
  const fixed = FIXED_STEP_DAYS[rule];
  if (fixed) {
    const gapDays = (parseLocal(fromIso).getTime() - anchor.getTime()) / 86_400_000;
    n = Math.max(0, Math.floor(gapDays / fixed) - 1);
  }

  for (let guard = 0; guard < MAX_STEPS; guard += 1, n += 1) {
    const occ = formatLocal(nth(anchor, rule, n));
    const day = occ.slice(0, 10);
    if (day > until) break;
    if (day >= fromIso) out.push(occ);
  }
  return out;
}

/**
 * First occurrence on or after `fromIso` (a date), or null once a series has
 * ended. One-off appointments return their own start, even if it's past, so
 * overdue appointments keep showing up like before.
 */
export function nextOccurrence(a: Appointment, fromIso = today()): string | null {
  if (!normalizeRecurrence(a.recurrence)) return a.startsAt;
  // A year covers the longest step; anything later means the series is over.
  const horizon = `${Number(fromIso.slice(0, 4)) + 1}${fromIso.slice(4)}`;
  return occurrencesBetween(a, fromIso, horizon)[0] ?? null;
}

/** The appointment moved to one of its occurrences (endsAt shifted by the same amount). */
export function atOccurrence(a: Appointment, startsAt: string): Appointment {
  if (startsAt === a.startsAt) return a;
  const shift = parseLocal(startsAt).getTime() - parseLocal(a.startsAt).getTime();
  const endsAt = a.endsAt ? formatLocal(new Date(parseLocal(a.endsAt).getTime() + shift)) : a.endsAt;
  return { ...a, startsAt, endsAt };
}

/** Every open appointment's occurrences in [fromIso, toIso], one entry per occurrence. */
export function expandAppointments(list: Appointment[], fromIso: string, toIso: string): Appointment[] {
  return list
    .filter((a) => !a.isDone)
    .flatMap((a) => occurrencesBetween(a, fromIso, toIso).map((s) => atOccurrence(a, s)));
}

/** Day after the given ISO date/datetime, as a date string. */
export function dayAfter(iso: string): string {
  const d = parseLocal(iso.slice(0, 10));
  d.setDate(d.getDate() + 1);
  return formatLocal(d).slice(0, 10);
}
