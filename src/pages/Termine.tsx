import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { Appointment, FamilyMember, ImportantDate } from "../api/types";
import { useDialog } from "../components/Dialog";
import { AppointmentCategoryDonut, AppointmentLoadChart } from "../components/FamilyCharts";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { countdown, dateTime, daysUntil, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useCustomOptions } from "../lib/useCustomOptions";
import type { Option } from "../lib/categories";
import type { DialogField } from "../components/Dialog";
import {
  RECURRENCE_OPTIONS, atOccurrence, dayAfter, expandAppointments, nextOccurrence,
  normalizeRecurrence, recurrenceLabel,
} from "../lib/recurrence";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_CELL_LIMIT = 3;

const IMPORTANT_META_START = "[important-meta]";
const IMPORTANT_META_END = "[/important-meta]";

function dateIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEndDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonth(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function addDaysDate(d: Date, delta: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function fromDateTimeInput(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length === 16) return `${raw}:00`;
  return raw;
}

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

type ImportantCadence = "monthly" | "quarterly" | "semiannual" | "yearly";

function importantCadence(d: ImportantDate): ImportantCadence {
  const values = parseMetaBlock(d.notes, IMPORTANT_META_START, IMPORTANT_META_END);
  const raw = (values.get("cadence") ?? "").toLowerCase();
  if (raw === "monthly" || raw === "quarterly" || raw === "semiannual" || raw === "yearly") return raw;
  return "yearly";
}

function withImportantCadence(notes: string | null | undefined, cadence: ImportantCadence): string | null {
  return writeMetaBlock(notes, IMPORTANT_META_START, IMPORTANT_META_END, [
    ["cadence", cadence],
  ]);
}

function cadenceMonths(cadence: ImportantCadence): number {
  if (cadence === "monthly") return 1;
  if (cadence === "quarterly") return 3;
  if (cadence === "semiannual") return 6;
  return 12;
}

function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth();
  const day = base.getDate();
  const first = new Date(y, m + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
}

function monthsBetween(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

const APPOINTMENT_CATEGORIES = [
  { value: "family", label: "Familie" },
  { value: "birthday", label: "Geburtstag" },
  { value: "anniversary", label: "Jahrestag" },
  { value: "authority", label: "Behörde" },
  { value: "health", label: "Gesundheit" },
  { value: "school", label: "Schule" },
  { value: "work", label: "Arbeit" },
  { value: "finance", label: "Finanzen" },
  { value: "travel", label: "Reise" },
  { value: "home", label: "Haushalt" },
  { value: "other", label: "Sonstiges" },
];

const IMPORTANT_DATE_CATEGORIES = [
  { value: "birthday", label: "Geburtstag" },
  { value: "wedding", label: "Hochzeitstag" },
  { value: "anniversary", label: "Jahrestag" },
  { value: "other", label: "Sonstiges" },
];

function importantDateCategoryLabel(category: string | null | undefined, options: Option[] = IMPORTANT_DATE_CATEGORIES): string {
  const key = String(category ?? "").trim().toLowerCase();
  return options.find((o) => o.value === key)?.label ?? (key || "Sonstiges");
}

function categoryLabel(category: string | null | undefined, options: Option[] = APPOINTMENT_CATEGORIES): string {
  const key = String(category ?? "").trim().toLowerCase();
  return options.find((o) => o.value === key)?.label ?? (key || "Termin");
}

function normalizeCategory(category: string | null | undefined, options: Option[] = APPOINTMENT_CATEGORIES): string {
  const key = String(category ?? "").trim().toLowerCase();
  return options.some((o) => o.value === key) ? key : "other";
}

function nextImportantOccurrence(d: ImportantDate, fromIso = today()): string {
  const cadence = importantCadence(d);
  const anchor = new Date(`${d.dateValue}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return d.dateValue;

  const from = new Date(`${fromIso}T00:00:00`);
  const step = cadenceMonths(cadence);

  if (anchor >= from) return dateIso(anchor);

  let candidate = new Date(anchor);
  let guard = 0;
  while (candidate < from && guard < 600) {
    candidate = addMonthsClamped(candidate, step);
    guard += 1;
  }
  return dateIso(candidate);
}

function occurrenceInMonth(d: ImportantDate, cursor: Date): string | null {
  const cadence = importantCadence(d);
  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();

  const [rawYear, rawMonth, rawDay] = d.dateValue.split("-").map(Number);
  if (!rawYear || !rawMonth || !rawDay) return null;

  const anchor = new Date(rawYear, rawMonth - 1, rawDay);
  const target = new Date(year, month - 1, 1);
  const deltaMonths = monthsBetween(target, anchor);
  if (deltaMonths < 0) return null;
  if (deltaMonths % cadenceMonths(cadence) !== 0) return null;

  const safeDay = Math.min(rawDay, new Date(year, month, 0).getDate());
  return dateIso(new Date(year, month - 1, safeDay));
}

// Shared by every appointment form; "bis" only shows once a repeat rule is picked.
const RECURRENCE_FIELDS: DialogField[] = [
  { key: "recurrence", label: "Wiederholung", type: "select", options: RECURRENCE_OPTIONS },
  { key: "recurrenceUntil", label: "Wiederholen bis (optional)", type: "date", visibleWhen: (d) => !!normalizeRecurrence(d.recurrence) },
];

function recurrencePayload(values: Record<string, unknown>) {
  const recurrence = normalizeRecurrence(values.recurrence);
  const until = String(values.recurrenceUntil ?? "").trim();
  return { recurrence, recurrenceUntil: recurrence && until ? until : null };
}

function attendeeNames(ids: number[], memberNameById: Map<number, string>): string {
  return ids.map((id) => memberNameById.get(id) ?? "Person").join(", ");
}

function appointmentTooltip(a: Appointment, memberNameById: Map<number, string>, categoryOptions: Option[]): string {
  const lines = [
    a.title,
    `Kategorie: ${categoryLabel(a.category, categoryOptions)}`,
    `Zeit: ${dateTime(a.startsAt)}`,
  ];
  const repeat = recurrenceLabel(a.recurrence);
  if (repeat) lines.push(`Wiederholung: ${repeat}${a.recurrenceUntil ? ` bis ${shortDate(a.recurrenceUntil)}` : ""}`);
  if (a.location) lines.push(`Ort: ${a.location}`);
  if (a.attendeeIds.length > 0) lines.push(`Personen: ${attendeeNames(a.attendeeIds, memberNameById)}`);
  return lines.join("\n");
}

function importantCadenceLabel(d: ImportantDate): string {
  const cadence = importantCadence(d);
  if (cadence === "monthly") return "monatlich";
  if (cadence === "quarterly") return "quartalsweise";
  if (cadence === "semiannual") return "alle 6 Monate";
  return "jährlich";
}

function importantDateTooltip(d: ImportantDate, occurrenceIso: string): string {
  const cadence = importantCadence(d);
  const cadenceLabel = cadence === "monthly"
    ? "monatlich"
    : cadence === "quarterly"
      ? "quartalsweise"
      : cadence === "semiannual"
        ? "alle 6 Monate"
        : "jaehrlich";
  const lines = [
    d.title,
    `Datum: ${shortDate(occurrenceIso)}`,
    `Wiederholung: ${cadenceLabel}`,
  ];
  return lines.join("\n");
}

export default function Termine() {
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const appts = useAsync<Appointment[]>(() => api.get("/api/appointments"), []);
  const dates = useAsync<ImportantDate[]>(() => api.get("/api/important-dates"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  // Any date inside the shown month/week; month view renders from monthStartDate(monthCursor).
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [mailScanBusy, setMailScanBusy] = useState(false);
  const [mailScanMessage, setMailScanMessage] = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const customAppointmentCategories = useCustomOptions("appointment-category");
  const appointmentCategoryOptions = [...APPOINTMENT_CATEGORIES, ...customAppointmentCategories.options];
  const customImportantDateCategories = useCustomOptions("important-date-category");
  const importantDateCategoryOptions = [...IMPORTANT_DATE_CATEGORIES, ...customImportantDateCategories.options];

  // Month navigation leaves the cursor on the 1st; for the current month open this week instead of the 1st's week.
  function showWeekView() {
    const now = new Date();
    setMonthCursor((m) => (m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth() ? now : m));
    setCalendarView("week");
  }

  async function scanAppointmentsMailbox() {
    setError(null);
    setMailScanMessage(null);
    setMailScanBusy(true);
    try {
      const res = await api.post<{ success: boolean; scanned: number; added: number; skippedDuplicate: number }>(
        "/api/appointments/scan-mailbox"
      );
      await appts.reload();
      setMailScanMessage(
        res.added === 0
          ? "Postfach durchsucht — keine neuen Termine gefunden."
          : `Postfach durchsucht: ${res.added} neue(r) Termin(e) hinzugefügt.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMailScanBusy(false);
    }
  }

  // Calendar/list entries of a series are per-occurrence copies; edits always go to the stored series.
  function seriesOf(a: Appointment): Appointment {
    return (appts.data ?? []).find((x) => x.id === a.id) ?? a;
  }

  // `a` may be an occurrence copy. Completing one occurrence of a series moves the series
  // anchor to the following occurrence; once there is none left the series is done.
  async function completeAppointment(a: Appointment) {
    const series = seriesOf(a);
    try {
      if (normalizeRecurrence(series.recurrence)) {
        const following = nextOccurrence(series, dayAfter(a.startsAt));
        await api.put(`/api/appointments/${series.id}`, following
          ? atOccurrence(series, following)
          : { ...series, isDone: true });
      } else {
        await api.put(`/api/appointments/${series.id}`, { ...series, isDone: true });
      }
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function reopenAppointment(a: Appointment) {
    try {
      await api.put(`/api/appointments/${a.id}`, { ...seriesOf(a), isDone: false });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editAppointment(occurrence: Appointment) {
    const a = seriesOf(occurrence);
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const isSeries = !!normalizeRecurrence(a.recurrence);
    const values = await dialog.form({
      title: isSeries ? "Terminserie bearbeiten" : "Termin bearbeiten",
      submitText: "Speichern",
      secondarySubmitText: "Duplizieren",
      secondarySubmitValue: "duplicate",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: isSeries ? "Start (erster Termin der Serie)" : "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
        {
          key: "category", label: "Kategorie", type: "select", options: appointmentCategoryOptions,
          allowCustomOption: { onAdd: (label) => customAppointmentCategories.add(label, appointmentCategoryOptions) },
        },
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
        ...RECURRENCE_FIELDS,
      ],
      initial: {
        title: a.title,
        startsAt: toLocalDateTimeInput(a.startsAt),
        location: a.location ?? "",
        category: normalizeCategory(a.category, appointmentCategoryOptions),
        attendeeIds: a.attendeeIds.join(","),
        recurrence: normalizeRecurrence(a.recurrence) ?? "",
        recurrenceUntil: a.recurrenceUntil ?? "",
      },
    });
    if (!values) return;

    try {
      const payload = {
        title: String(values.title).trim(),
        startsAt: fromDateTimeInput(values.startsAt) ?? a.startsAt,
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category), appointmentCategoryOptions),
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
        reminderDays: a.reminderDays,
        isDone: false,
        ...recurrencePayload(values),
      };

      const action = String((values as Record<string, unknown>).__dialogAction ?? "");
      if (action === "duplicate") {
        await api.post("/api/appointments", payload);
      } else {
        await api.put(`/api/appointments/${a.id}`, {
          ...a,
          ...payload,
        });
      }
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeAppointment(id: number) {
    const isSeries = !!normalizeRecurrence((appts.data ?? []).find((x) => x.id === id)?.recurrence);
    const ok = await dialog.confirm(isSeries
      ? { title: "Terminserie löschen", message: "Die ganze Terminserie mit allen Wiederholungen löschen?", confirmText: "Löschen", danger: true }
      : { title: "Termin löschen", message: "Termin wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/appointments/${id}`);
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editDate(d: ImportantDate) {
    const values = await dialog.form({
      title: "Wichtiges Datum bearbeiten",
      fields: [
        { key: "title", label: "Anlass" },
        {
          key: "category", label: "Kategorie", type: "select", options: importantDateCategoryOptions,
          allowCustomOption: { onAdd: (label) => customImportantDateCategories.add(label, importantDateCategoryOptions) },
        },
        { key: "dateValue", label: "Datum", type: "date" },
        {
          key: "cadence",
          label: "Wiederholung",
          type: "select",
          options: [
            { value: "monthly", label: "monatlich" },
            { value: "quarterly", label: "quartalsweise" },
            { value: "semiannual", label: "alle 6 Monate" },
            { value: "yearly", label: "jährlich" },
          ],
        },
      ],
      initial: {
        title: d.title,
        category: d.category || "other",
        dateValue: d.dateValue,
        cadence: importantCadence(d),
      },
    });
    if (!values) return;

    try {
      const cadence = String(values.cadence) as ImportantCadence;
      await api.put(`/api/important-dates/${d.id}`, {
        ...d,
        title: String(values.title).trim(),
        category: String(values.category || "other"),
        dateValue: String(values.dateValue),
        repeatsYearly: true,
        notes: withImportantCadence(d.notes, cadence),
      });
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeDate(id: number) {
    const ok = await dialog.confirm({ title: "Datum löschen", message: "Wichtiges Datum wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/important-dates/${id}`);
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addAppointment() {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Termin anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
        {
          key: "category", label: "Kategorie", type: "select", options: appointmentCategoryOptions,
          allowCustomOption: { onAdd: (label) => customAppointmentCategories.add(label, appointmentCategoryOptions) },
        },
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
        ...RECURRENCE_FIELDS,
      ],
      initial: {
        title: "",
        startsAt: "",
        location: "",
        category: "family",
        attendeeIds: "",
        recurrence: "",
        recurrenceUntil: "",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.startsAt).trim()) return;

    try {
      await api.post("/api/appointments", {
        title: String(values.title).trim(),
        startsAt: fromDateTimeInput(values.startsAt),
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category), appointmentCategoryOptions),
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
        reminderDays: 3,
        ...recurrencePayload(values),
        isDone: false,
      });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addAppointmentAtDate(dayIso: string) {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Termin im Kalender anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
        {
          key: "category", label: "Kategorie", type: "select", options: appointmentCategoryOptions,
          allowCustomOption: { onAdd: (label) => customAppointmentCategories.add(label, appointmentCategoryOptions) },
        },
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
        ...RECURRENCE_FIELDS,
      ],
      initial: {
        title: "",
        startsAt: `${dayIso}T09:00`,
        location: "",
        category: "family",
        attendeeIds: "",
        recurrence: "",
        recurrenceUntil: "",
      },
    });
    if (!values) return;
    if (!String(values.title).trim()) return;

    const startsAt = fromDateTimeInput(values.startsAt) ?? `${dayIso}T09:00:00`;

    try {
      await api.post("/api/appointments", {
        title: String(values.title).trim(),
        startsAt,
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category), appointmentCategoryOptions),
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
        reminderDays: 3,
        ...recurrencePayload(values),
        isDone: false,
      });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addDate() {
    const values = await dialog.form({
      title: "Datum anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Anlass" },
        {
          key: "category", label: "Kategorie", type: "select", options: importantDateCategoryOptions,
          allowCustomOption: { onAdd: (label) => customImportantDateCategories.add(label, importantDateCategoryOptions) },
        },
        { key: "dateValue", label: "Datum", type: "date" },
        { key: "cadence", label: "Wiederholung", type: "select", options: [
          { value: "monthly", label: "monatlich" },
          { value: "quarterly", label: "quartalsweise" },
          { value: "semiannual", label: "alle 6 Monate" },
          { value: "yearly", label: "jährlich" },
        ] },
      ],
      initial: {
        title: "",
        category: "other",
        dateValue: today(),
        cadence: "yearly",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.dateValue).trim()) return;

    try {
      const cadence = String(values.cadence) as ImportantCadence;
      await api.post("/api/important-dates", {
        title: String(values.title).trim(),
        category: String(values.category || "other"),
        dateValue: String(values.dateValue),
        repeatsYearly: true,
        notes: withImportantCadence(null, cadence),
        reminderDays: 14,
      });
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const UPCOMING_WINDOW_DAYS = 14;
  // A series is listed once, at its next occurrence; a series whose end date has passed
  // counts as done.
  const openAppointments = (appts.data ?? []).filter((a) => !a.isDone);
  const allUpcoming = openAppointments
    .flatMap((a) => {
      const next = nextOccurrence(a);
      return next ? [atOccurrence(a, next)] : [];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const endedSeries = openAppointments.filter((a) => nextOccurrence(a) === null);
  const upcoming = showAllUpcoming
    ? allUpcoming
    : allUpcoming.filter((a) => {
        const days = daysUntil(a.startsAt.slice(0, 10));
        return days === null || days <= UPCOMING_WINDOW_DAYS;
      });
  const doneAppointments = [...(appts.data ?? []).filter((a) => a.isDone), ...endedSeries]
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const loadChartAppointments = expandAppointments(openAppointments, today(), dateIso(addDaysDate(new Date(), UPCOMING_WINDOW_DAYS)));
  const memberNameById = new Map((members.data ?? []).map((m) => [m.id, m.fullName]));

  const appointmentCategoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of (appts.data ?? [])) {
      if (a.isDone) continue;
      const key = normalizeCategory(a.category, appointmentCategoryOptions);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return appointmentCategoryOptions
      .map((c) => [c.label, counts.get(c.value) ?? 0] as [string, number])
      .filter(([, value]) => value > 0);
  }, [appts.data, appointmentCategoryOptions]);

  const sortedDates = useMemo(() => {
    return (dates.data ?? [])
      .map((d) => ({ date: d, offsetDays: daysUntil(nextImportantOccurrence(d)) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.offsetDays - b.offsetDays)
      .map((x) => x.date);
  }, [dates.data]);

  const calendarCells = useMemo(() => {
    if (calendarView === "week") {
      const weekStart = startOfWeek(monthCursor);
      return Array.from({ length: 7 }).map((_, idx) => {
        const d = addDaysDate(weekStart, idx);
        return {
          iso: dateIso(d),
          day: d.getDate(),
          inMonth: true,
        };
      });
    }

    const start = monthStartDate(monthCursor);
    const end = monthEndDate(monthCursor);
    const offset = (start.getDay() + 6) % 7;
    const totalDays = end.getDate();
    const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];

    for (let i = 0; i < offset; i += 1) {
      const d = new Date(start);
      d.setDate(1 - (offset - i));
      cells.push({ iso: dateIso(d), day: d.getDate(), inMonth: false });
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const d = new Date(start.getFullYear(), start.getMonth(), day);
      cells.push({ iso: dateIso(d), day, inMonth: true });
    }
    for (let after = 1; cells.length % 7 !== 0; after += 1) {
      const d = new Date(end);
      d.setDate(d.getDate() + after);
      cells.push({ iso: dateIso(d), day: d.getDate(), inMonth: false });
    }
    return cells;
  }, [monthCursor, calendarView]);

  // Repeating appointments get one entry per occurrence inside the visible cells.
  const apptByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    if (calendarCells.length === 0) return map;
    const from = calendarCells[0].iso;
    const to = calendarCells[calendarCells.length - 1].iso;
    for (const a of expandAppointments(appts.data ?? [], from, to)) {
      const day = a.startsAt.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(a);
      map.set(day, list);
    }
    return map;
  }, [appts.data, calendarCells]);

  // Covers every month the visible cells touch, so a week crossing a month boundary still shows its dates.
  const importantByDay = useMemo(() => {
    const monthKeys = new Set(calendarCells.map((c) => c.iso.slice(0, 7)));
    const map = new Map<string, ImportantDate[]>();
    for (const key of monthKeys) {
      const [y, m] = key.split("-").map(Number);
      for (const d of (dates.data ?? [])) {
        const iso = occurrenceInMonth(d, new Date(y, m - 1, 1));
        if (!iso) continue;
        const list = map.get(iso) ?? [];
        list.push(d);
        map.set(iso, list);
      }
    }
    return map;
  }, [dates.data, calendarCells]);

  const weekLabel = useMemo(() => {
    const s = startOfWeek(monthCursor);
    const e = addDaysDate(s, 6);
    return `${shortDate(dateIso(s))} - ${shortDate(dateIso(e))}`;
  }, [monthCursor]);

  return (
    <>
      <PageHead eyebrow="Termine" title="Was wann anliegt"
        lede="Kalender, Termine und wichtige Anlässe im Überblick." />
      <ErrorBar message={error ?? appts.error ?? dates.error} />

      <Section title="Kalender" action={<>
        <button className="btn ghost icon-only" aria-label="Postfach nach Terminen durchsuchen" title="Postfach nach Terminen durchsuchen" onClick={scanAppointmentsMailbox} disabled={mailScanBusy}>
          <i className={`fa-solid ${mailScanBusy ? "fa-spinner fa-spin" : "fa-envelope-open-text"}`} aria-hidden />
          <span className="sr-only">Postfach nach Terminen durchsuchen</span>
        </button>{" "}
        <button className="btn icon-only" aria-label="Termin anlegen" title="Termin anlegen" onClick={addAppointment}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Termin anlegen</span></button>
      </>}>
        {mailScanMessage && <p className="lede" style={{ marginTop: -4, marginBottom: 10 }}>{mailScanMessage}</p>}
        <div className="card calendar-card">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button className="btn ghost small icon-only" aria-label={calendarView === "month" ? "Vorheriger Monat" : "Vorherige Woche"} title={calendarView === "month" ? "Vorheriger Monat" : "Vorherige Woche"} onClick={() => setMonthCursor((m) => calendarView === "month" ? addMonth(m, -1) : addDaysDate(m, -7))}>
                <i className="fa-solid fa-chevron-left" aria-hidden />
                <span className="sr-only">Zurück</span>
              </button>
              <strong className="cal-label">
                {calendarView === "month" ? monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : weekLabel}
              </strong>
              <button className="btn ghost small icon-only" aria-label={calendarView === "month" ? "Nächster Monat" : "Nächste Woche"} title={calendarView === "month" ? "Nächster Monat" : "Nächste Woche"} onClick={() => setMonthCursor((m) => calendarView === "month" ? addMonth(m, 1) : addDaysDate(m, 7))}>
                <i className="fa-solid fa-chevron-right" aria-hidden />
                <span className="sr-only">Weiter</span>
              </button>
            </div>
            <div className="cal-views">
              <button className={`chip ${calendarView === "month" ? "on" : ""}`} onClick={() => setCalendarView("month")}>Monat</button>
              <button className={`chip ${calendarView === "week" ? "on" : ""}`} onClick={showWeekView}>Woche</button>
              <button className="btn ghost small" onClick={() => setMonthCursor(new Date())}>Heute</button>
            </div>
          </div>

          <div className={`family-calendar ${calendarView === "week" ? "week-view" : "month-view"}`}>
            {WEEKDAYS.map((wd) => <div key={wd} className="family-calendar-wd">{wd}</div>)}

            {calendarCells.map((cell, idx) => {
              const isToday = cell.iso === today();
              const items = [...(apptByDay.get(cell.iso) ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              const importantItems = importantByDay.get(cell.iso) ?? [];
              const total = items.length + importantItems.length;
              const dayDistance = daysUntil(cell.iso) ?? 999;
              const hasNearReminder = total > 0 && dayDistance >= 0 && dayDistance <= 2;
              // Month view keeps cells even: show a few entries, the rest behind "+N" (opens that week).
              const limit = calendarView === "month" ? MONTH_CELL_LIMIT : Number.MAX_SAFE_INTEGER;
              const visibleImportant = importantItems.slice(0, limit);
              const visibleItems = items.slice(0, Math.max(0, limit - visibleImportant.length));
              const hidden = total - visibleImportant.length - visibleItems.length;
              const cellTooltipLines: string[] = [];
              for (const d of importantItems) {
                cellTooltipLines.push(`• ${d.title} (Wichtiges Datum)`);
              }
              for (const a of items) {
                const when = dateTime(a.startsAt);
                const cat = categoryLabel(a.category, appointmentCategoryOptions);
                cellTooltipLines.push(`• ${a.title} (${cat}, ${when})`);
              }
              const cellTitle = cellTooltipLines.length > 0
                ? `${shortDate(cell.iso)}\n${cellTooltipLines.join("\n")}`
                : "Termin anlegen";
              return (
                <div
                  key={cell.iso}
                  className={`family-calendar-cell ${cell.inMonth ? "" : "out"} ${total > 0 ? "has-items" : ""} ${isToday ? "today" : ""}`}
                  title={cellTitle}
                  role="button"
                  tabIndex={0}
                  onClick={() => { void addAppointmentAtDate(cell.iso); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void addAppointmentAtDate(cell.iso);
                    }
                  }}
                >
                  <div className="calendar-cell-head">
                    {calendarView === "week" && <span className="wd">{WEEKDAYS[idx % 7]}</span>}
                    <span className="day">{cell.day}{isToday && <span className="sr-only"> (heute)</span>}</span>
                    {calendarView === "week" && <span className="month">{new Date(`${cell.iso}T00:00:00`).toLocaleDateString("de-DE", { month: "short" })}</span>}
                    {hasNearReminder && <span className="calendar-reminder-dot" title="Erinnerung in den nächsten 2 Tagen" />}
                    {calendarView === "week" && total === 0 && <span className="cal-empty">Keine Termine</span>}
                  </div>
                  {visibleImportant.map((d) => (
                    <span
                      key={`imp-${d.id}`}
                      className="appt important-date"
                      title={importantDateTooltip(d, cell.iso)}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); void editDate(d); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          void editDate(d);
                        }
                      }}
                    >
                      <span className="appt-title">{d.title}</span>
                    </span>
                  ))}
                  {visibleItems.map((a) => {
                    const time = a.startsAt.slice(11, 16);
                    return (
                      <span
                        key={a.id}
                        className={`appt appt-cat-${normalizeCategory(a.category, appointmentCategoryOptions)}`}
                        title={appointmentTooltip(a, memberNameById, appointmentCategoryOptions)}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); void editAppointment(a); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            void editAppointment(a);
                          }
                        }}
                      >
                        {time && time !== "00:00" && <span className="appt-time">{time}</span>}
                        <span className="appt-title">
                          {normalizeRecurrence(a.recurrence) && <i className="fa-solid fa-repeat" aria-label="Wiederkehrend" style={{ marginRight: 4, fontSize: "0.85em", opacity: 0.75 }} />}
                          {a.title}
                        </span>
                        {calendarView === "week" && (a.location || a.attendeeIds.length > 0) && (
                          <span className="appt-meta">
                            {[a.location, a.attendeeIds.length > 0 ? attendeeNames(a.attendeeIds, memberNameById) : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="appt more"
                      title="Alle Termine dieses Tages in der Wochenansicht zeigen"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMonthCursor(new Date(`${cell.iso}T00:00:00`));
                        setCalendarView("week");
                      }}
                    >
                      +{hidden}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="family-calendar-legend">
            {APPOINTMENT_CATEGORIES.map((c) => (
              <span key={c.value} className={`badge appt-cat-${c.value}`}>{c.label}</span>
            ))}
            <span className="badge important-date">Wichtige Daten</span>
          </div>
        </div>
      </Section>

      <Section title={showAllUpcoming ? "Termine · alle" : "Termine · nächste 14 Tage"}
        action={<button className={`chip ${showAllUpcoming ? "on" : ""}`} onClick={() => setShowAllUpcoming((v) => !v)}>
          {showAllUpcoming ? "Nur nächste 14 Tage" : "Alle anzeigen"}
        </button>}>
        {upcoming.length === 0
          ? <Empty title="Keine offenen Termine." hint="Neue Termine erscheinen hier, sobald du sie anlegst." />
          : <div className="card">
              <div className="card-list">
                {upcoming.map((a) => (
                  <div key={a.id} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{a.title}</strong>
                      <span className="badge">{countdown(daysUntil(a.startsAt.slice(0, 10)))}</span>
                    </div>
                    <div className="alert-msg">
                      {categoryLabel(a.category, appointmentCategoryOptions)} · {dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}
                      {a.attendeeIds.length > 0 ? ` · ${attendeeNames(a.attendeeIds, memberNameById)}` : ""}
                      {recurrenceLabel(a.recurrence) ? ` · ${recurrenceLabel(a.recurrence)}${a.recurrenceUntil ? ` bis ${shortDate(a.recurrenceUntil)}` : ""}` : ""}
                    </div>
                    <div className="action-stack mobile-card-actions">
                      <button className="btn ghost small icon-only"
                        aria-label={normalizeRecurrence(a.recurrence) ? "Diesen Termin der Serie als erledigt markieren" : "Termin als erledigt markieren"}
                        title={normalizeRecurrence(a.recurrence) ? "Diesen Termin der Serie als erledigt markieren" : "Termin als erledigt markieren"}
                        onClick={() => completeAppointment(a)}>
                        <i className="fa-solid fa-check" aria-hidden />
                        <span className="sr-only">Erledigt</span>
                      </button>
                      <button className="btn ghost small icon-only" aria-label="Termin bearbeiten" title="Termin bearbeiten" onClick={() => editAppointment(a)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
        {doneAppointments.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Erledigte Termine</strong>
            <div className="card-list" style={{ marginTop: 10 }}>
              {doneAppointments.map((a) => (
                <div key={a.id} className="mobile-card">
                  <strong>{a.title}</strong>
                  <div className="alert-msg">
                    {categoryLabel(a.category)} · {dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}
                    {a.attendeeIds.length > 0 ? ` · ${attendeeNames(a.attendeeIds, memberNameById)}` : ""}
                    {!a.isDone ? " · Serie beendet" : ""}
                  </div>
                  <div className="action-stack mobile-card-actions">
                    {a.isDone ? (
                      <button className="btn ghost small icon-only" aria-label="Termin wieder öffnen" title="Termin wieder öffnen" onClick={() => reopenAppointment(a)}>
                        <i className="fa-solid fa-rotate-left" aria-hidden />
                        <span className="sr-only">Wieder öffnen</span>
                      </button>
                    ) : (
                      <button className="btn ghost small icon-only" aria-label="Serie bearbeiten" title="Serie bearbeiten" onClick={() => editAppointment(a)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                    )}
                    <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div className="chart-row">
        <AppointmentCategoryDonut categories={appointmentCategoryData} />
        <AppointmentLoadChart appointments={loadChartAppointments}horizonDays={14} bucketDays={1} title="Terminlast · nächste 14 Tage" />
      </div>

      <Section title="Wichtige Anlässe" action={<button className="btn icon-only" aria-label="Datum anlegen" title="Datum anlegen" onClick={addDate}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Datum anlegen</span></button>}>
        {(dates.data ?? []).length === 0
          ? <Empty title="Noch keine wichtigen Anlässe." hint="Geburtstage, Jahrestage und weitere wiederkehrende Anlässe erscheinen hier." />
          : <div className="card">
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Anlass</th><th>Kategorie</th><th>Datum</th><th>Wiederholung</th><th className="num">Countdown</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {sortedDates.map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.title}</strong></td>
                        <td><span className={`badge important-date-cat-${(d.category || "other").toLowerCase()}`}>{importantDateCategoryLabel(d.category, importantDateCategoryOptions)}</span></td>
                        <td>{shortDate(d.dateValue)}</td>
                        <td>{importantCadenceLabel(d)}</td>
                        <td className="num">{countdown(daysUntil(nextImportantOccurrence(d)))}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button className="btn ghost small icon-only" aria-label="Datum bearbeiten" title="Datum bearbeiten" onClick={() => editDate(d)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Datum löschen" title="Datum löschen" onClick={() => removeDate(d.id)}>
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

              <div className="rtable-cards">
                {sortedDates.map((d) => (
                  <div key={`m-${d.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{d.title}</strong>
                      <span className={`badge important-date-cat-${(d.category || "other").toLowerCase()}`}>{importantDateCategoryLabel(d.category, importantDateCategoryOptions)}</span>
                    </div>
                    <div className="alert-msg">{shortDate(d.dateValue)} · {importantCadenceLabel(d)}</div>
                    <div className="mobile-card-grid">
                      <span>Countdown: <strong>{countdown(daysUntil(nextImportantOccurrence(d)))}</strong></span>
                    </div>
                    <div className="action-stack mobile-card-actions">
                      <button className="btn ghost small icon-only" aria-label="Datum bearbeiten" title="Datum bearbeiten" onClick={() => editDate(d)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Datum löschen" title="Datum löschen" onClick={() => removeDate(d.id)}>
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
