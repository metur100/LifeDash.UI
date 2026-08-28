import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { Appointment, FamilyMember, ImportantDate } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { countdown, dateTime, daysUntil, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

type PersonMeta = {
  heightCm: string;
  weightKg: string;
  bloodType: string;
  allergies: string;
  medication: string;
};

const META_START = "[profile-meta]";
const META_END = "[/profile-meta]";

function parsePersonMeta(notes?: string | null): { meta: PersonMeta } {
  const empty: PersonMeta = {
    heightCm: "",
    weightKg: "",
    bloodType: "",
    allergies: "",
    medication: "",
  };
  const text = notes ?? "";
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start < 0 || end < 0 || end <= start) return { meta: empty };

  const raw = text.slice(start + META_START.length, end).trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  const kv = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    kv.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  return {
    meta: {
      heightCm: kv.get("heightCm") ?? "",
      weightKg: kv.get("weightKg") ?? "",
      bloodType: kv.get("bloodType") ?? "",
      allergies: kv.get("allergies") ?? "",
      medication: kv.get("medication") ?? "",
    },
  };
}

function buildPersonNotes(meta: PersonMeta): string | null {
  const lines = [
    `heightCm:${meta.heightCm.trim()}`,
    `weightKg:${meta.weightKg.trim()}`,
    `bloodType:${meta.bloodType.trim()}`,
    `allergies:${meta.allergies.trim()}`,
    `medication:${meta.medication.trim()}`,
  ];
  const hasAnyMeta = lines.some((x) => x.split(":")[1]?.trim());
  if (!hasAnyMeta) return null;
  return `${META_START}\n${lines.join("\n")}\n${META_END}`;
}

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

function plusOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return dateIso(d);
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

const categoryLabelByValue = new Map(APPOINTMENT_CATEGORIES.map((x) => [x.value, x.label]));

function categoryLabel(category?: string | null): string {
  const key = String(category ?? "").trim().toLowerCase();
  return categoryLabelByValue.get(key) ?? (key || "Termin");
}

function normalizeCategory(category?: string | null): string {
  const key = String(category ?? "").trim().toLowerCase();
  return categoryLabelByValue.has(key) ? key : "other";
}

function nextImportantOccurrence(d: ImportantDate, fromIso = today()): string {
  if (!d.repeatsYearly) return d.dateValue;

  const [y, m, day] = d.dateValue.split("-").map(Number);
  if (!y || !m || !day) return d.dateValue;

  const [fromYear] = fromIso.split("-").map(Number);
  const safeDayThisYear = Math.min(day, new Date(fromYear, m, 0).getDate());
  const thisYearIso = dateIso(new Date(fromYear, m - 1, safeDayThisYear));
  if (thisYearIso >= fromIso) return thisYearIso;

  const nextYear = fromYear + 1;
  const safeDayNextYear = Math.min(day, new Date(nextYear, m, 0).getDate());
  return dateIso(new Date(nextYear, m - 1, safeDayNextYear));
}

function occurrenceInMonth(d: ImportantDate, cursor: Date): string | null {
  const month = cursor.getMonth() + 1;
  const year = cursor.getFullYear();

  const [rawYear, rawMonth, rawDay] = d.dateValue.split("-").map(Number);
  if (!rawYear || !rawMonth || !rawDay) return null;

  if (!d.repeatsYearly) {
    return rawYear === year && rawMonth === month ? d.dateValue : null;
  }

  if (rawMonth !== month) return null;
  const safeDay = Math.min(rawDay, new Date(year, month, 0).getDate());
  return dateIso(new Date(year, month - 1, safeDay));
}

function appointmentTooltip(a: Appointment, memberNameById: Map<number, string>): string {
  const lines = [
    a.title,
    `Kategorie: ${categoryLabel(a.category)}`,
    `Zeit: ${dateTime(a.startsAt)}`,
  ];
  if (a.location) lines.push(`Ort: ${a.location}`);
  if (a.familyMemberId) lines.push(`Person: ${memberNameById.get(a.familyMemberId) ?? "Person"}`);
  return lines.join("\n");
}

function importantDateTooltip(d: ImportantDate, occurrenceIso: string): string {
  const lines = [
    d.title,
    `Datum: ${shortDate(occurrenceIso)}`,
    `Wiederholung: ${d.repeatsYearly ? "jaehrlich" : "einmalig"}`,
  ];
  return lines.join("\n");
}

export default function Family() {
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const appts = useAsync<Appointment[]>(() => api.get("/api/appointments"), []);
  const dates = useAsync<ImportantDate[]>(() => api.get("/api/important-dates"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => monthStartDate(new Date()));
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [onlyTomorrowWindow, setOnlyTomorrowWindow] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<string[]>(() => APPOINTMENT_CATEGORIES.map((x) => x.value));

  const todayIso = today();
  const tomorrowIso = plusOneDay(todayIso);

  function categoryVisible(category?: string | null) {
    return visibleCategories.includes(normalizeCategory(category));
  }

  function inTomorrowWindow(iso: string) {
    return iso === todayIso || iso === tomorrowIso;
  }

  function toggleCategory(category: string) {
    setVisibleCategories((prev) => prev.includes(category)
      ? prev.filter((x) => x !== category)
      : [...prev, category]);
  }

  async function addMember() {
    const values = await dialog.form({
      title: "Person hinzufügen",
      submitText: "Anlegen",
      fields: [
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: [
          { value: "self", label: "ich" },
          { value: "spouse", label: "Partner:in" },
          { value: "child", label: "Kind" },
          { value: "other", label: "sonstige" },
        ] },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "bloodType", label: "Blutgruppe" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: "",
        relation: "self",
        birthDate: "",
        nationality: "",
        heightCm: "",
        weightKg: "",
        bloodType: "",
        allergies: "",
        medication: "",
      },
    });
    if (!values) return;
    if (!String(values.fullName).trim()) return;

    try {
      const notes = buildPersonNotes({
        heightCm: String(values.heightCm ?? ""),
        weightKg: String(values.weightKg ?? ""),
        bloodType: String(values.bloodType ?? ""),
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
      });

      await api.post("/api/family-members", {
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        notes,
      });
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function completeAppointment(a: Appointment) {
    try {
      await api.put(`/api/appointments/${a.id}`, { ...a, isDone: true });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function reopenAppointment(a: Appointment) {
    try {
      await api.put(`/api/appointments/${a.id}`, { ...a, isDone: false });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editMember(m: FamilyMember) {
    const parsed = parsePersonMeta(m.notes);
    const values = await dialog.form({
      title: "Person bearbeiten",
      fields: [
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: [
          { value: "", label: "-" },
          { value: "self", label: "ich" },
          { value: "spouse", label: "Partner:in" },
          { value: "child", label: "Kind" },
          { value: "other", label: "sonstige" },
        ] },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "bloodType", label: "Blutgruppe" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: m.fullName,
        relation: m.relation ?? "",
        birthDate: m.birthDate ?? "",
        nationality: m.nationality ?? "",
        heightCm: parsed.meta.heightCm,
        weightKg: parsed.meta.weightKg,
        bloodType: parsed.meta.bloodType,
        allergies: parsed.meta.allergies,
        medication: parsed.meta.medication,
      },
    });
    if (!values) return;

    try {
      const notes = buildPersonNotes({
        heightCm: String(values.heightCm ?? ""),
        weightKg: String(values.weightKg ?? ""),
        bloodType: String(values.bloodType ?? ""),
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
      });

      await api.put(`/api/family-members/${m.id}`, {
        ...m,
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        notes,
      });
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeMember(id: number) {
    const ok = await dialog.confirm({ title: "Person löschen", message: "Person wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/family-members/${id}`);
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editAppointment(a: Appointment) {
    const memberOptions = [
      { value: "", label: "-" },
      ...(members.data ?? []).map((m) => ({ value: String(m.id), label: m.fullName })),
    ];

    const values = await dialog.form({
      title: "Termin bearbeiten",
      submitText: "Speichern",
      secondarySubmitText: "Duplizieren",
      secondarySubmitValue: "duplicate",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
        { key: "category", label: "Kategorie", type: "select", options: APPOINTMENT_CATEGORIES },
        { key: "familyMemberId", label: "Person", type: "select", options: memberOptions },
      ],
      initial: {
        title: a.title,
        startsAt: toLocalDateTimeInput(a.startsAt),
        location: a.location ?? "",
        category: normalizeCategory(a.category),
        familyMemberId: a.familyMemberId ? String(a.familyMemberId) : "",
      },
    });
    if (!values) return;

    try {
      const payload = {
        title: String(values.title).trim(),
        startsAt: fromDateTimeInput(values.startsAt) ?? a.startsAt,
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category)),
        familyMemberId: String(values.familyMemberId).trim() ? Number(values.familyMemberId) : null,
        reminderDays: a.reminderDays,
        isDone: false,
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
    const ok = await dialog.confirm({ title: "Termin löschen", message: "Termin wirklich löschen?", confirmText: "Löschen", danger: true });
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
        { key: "dateValue", label: "Datum", type: "date" },
        {
          key: "repeatsYearly",
          label: "Wiederholung",
          type: "select",
          options: [
            { value: "true", label: "jährlich" },
            { value: "false", label: "einmalig" },
          ],
        },
      ],
      initial: {
        title: d.title,
        dateValue: d.dateValue,
        repeatsYearly: d.repeatsYearly ? "true" : "false",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/important-dates/${d.id}`, {
        ...d,
        title: String(values.title).trim(),
        dateValue: String(values.dateValue),
        repeatsYearly: String(values.repeatsYearly) === "true",
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
        { key: "category", label: "Kategorie", type: "select", options: APPOINTMENT_CATEGORIES },
        { key: "familyMemberId", label: "Person", type: "select", options: memberOptions },
      ],
      initial: {
        title: "",
        startsAt: "",
        location: "",
        category: "family",
        familyMemberId: "",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.startsAt).trim()) return;

    try {
      await api.post("/api/appointments", {
        title: String(values.title).trim(),
        startsAt: fromDateTimeInput(values.startsAt),
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category)),
        familyMemberId: String(values.familyMemberId).trim() ? Number(values.familyMemberId) : null,
        reminderDays: 3,
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
        { key: "category", label: "Kategorie", type: "select", options: APPOINTMENT_CATEGORIES },
        { key: "familyMemberId", label: "Person", type: "select", options: memberOptions },
      ],
      initial: {
        title: "",
        startsAt: `${dayIso}T09:00`,
        location: "",
        category: "family",
        familyMemberId: "",
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
        category: normalizeCategory(String(values.category)),
        familyMemberId: String(values.familyMemberId).trim() ? Number(values.familyMemberId) : null,
        reminderDays: 3,
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
        { key: "dateValue", label: "Datum", type: "date" },
        { key: "repeatsYearly", label: "Wiederholung", type: "select", options: [
          { value: "true", label: "jährlich" },
          { value: "false", label: "einmalig" },
        ] },
      ],
      initial: {
        title: "",
        dateValue: today(),
        repeatsYearly: "true",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.dateValue).trim()) return;

    try {
      await api.post("/api/important-dates", {
        title: String(values.title).trim(),
        dateValue: String(values.dateValue),
        repeatsYearly: String(values.repeatsYearly) === "true",
        reminderDays: 14,
      });
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const upcoming = (appts.data ?? [])
    .filter((a) => !a.isDone)
    .filter((a) => categoryVisible(a.category))
    .filter((a) => !onlyTomorrowWindow || inTomorrowWindow(a.startsAt.slice(0, 10)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const doneAppointments = (appts.data ?? [])
    .filter((a) => a.isDone)
    .filter((a) => categoryVisible(a.category))
    .filter((a) => !onlyTomorrowWindow || inTomorrowWindow(a.startsAt.slice(0, 10)))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const memberNameById = new Map((members.data ?? []).map((m) => [m.id, m.fullName]));
  const apptByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of (appts.data ?? []).filter((x) => !x.isDone).filter((x) => categoryVisible(x.category))) {
      if (onlyTomorrowWindow && !inTomorrowWindow(a.startsAt.slice(0, 10))) continue;
      const day = a.startsAt.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(a);
      map.set(day, list);
    }
    return map;
  }, [appts.data, visibleCategories, onlyTomorrowWindow]);

  const importantByDay = useMemo(() => {
    const map = new Map<string, ImportantDate[]>();
    for (const d of (dates.data ?? [])) {
      const iso = occurrenceInMonth(d, monthCursor);
      if (!iso) continue;
      if (onlyTomorrowWindow && !inTomorrowWindow(iso)) continue;
      const list = map.get(iso) ?? [];
      list.push(d);
      map.set(iso, list);
    }
    return map;
  }, [dates.data, monthCursor, onlyTomorrowWindow]);

  const calendarCells = useMemo(() => {
    if (calendarView === "week") {
      const weekStart = startOfWeek(monthCursor);
      return Array.from({ length: 7 }).map((_, idx) => {
        const d = addDaysDate(weekStart, idx);
        return {
          iso: dateIso(d),
          day: d.getDate(),
          inMonth: d.getMonth() === monthCursor.getMonth(),
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
    while (cells.length % 7 !== 0) {
      const d = new Date(end);
      d.setDate(d.getDate() + (cells.length % 7));
      cells.push({ iso: dateIso(d), day: d.getDate(), inMonth: false });
    }
    return cells;
  }, [monthCursor, calendarView]);

  const weekLabel = useMemo(() => {
    const s = startOfWeek(monthCursor);
    const e = addDaysDate(s, 6);
    return `${shortDate(dateIso(s))} - ${shortDate(dateIso(e))}`;
  }, [monthCursor]);

  return (
    <>
      <PageHead eyebrow="Familie" title="Wer wann was braucht"
        lede="Personen, Termine und wichtige Daten fuer dein Familien- und Erwachsenenleben." />
      <ErrorBar message={error ?? members.error ?? appts.error} />

      <Section title="Personen" action={<button className="btn icon-only" aria-label="Person hinzufügen" title="Person hinzufügen" onClick={addMember}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Person hinzufügen</span></button>}>
        <div className="card">
          <table>
            <thead><tr><th>Name</th><th>Rolle</th><th>Geburtstag</th><th>Staatsangehörigkeit</th><th className="num action-col">Aktion</th></tr></thead>
            <tbody>
              {(members.data ?? []).map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.fullName}</strong>
                    {(() => {
                      const parsed = parsePersonMeta(m.notes);
                      const meta: string[] = [];
                      if (parsed.meta.heightCm) meta.push(`${parsed.meta.heightCm} cm`);
                      if (parsed.meta.weightKg) meta.push(`${parsed.meta.weightKg} kg`);
                      if (parsed.meta.bloodType) meta.push(`Blutgruppe ${parsed.meta.bloodType}`);
                      if (parsed.meta.allergies) meta.push(`Allergien: ${parsed.meta.allergies}`);
                      return meta.length > 0 ? <div className="alert-msg">{meta.join(" · ")}</div> : null;
                    })()}
                  </td>
                  <td>{m.relation ?? "—"}</td>
                  <td>{shortDate(m.birthDate)}</td>
                  <td>{m.nationality ?? "—"}</td>
                  <td className="num action-cell">
                    <div className="action-stack">
                    <button className="btn ghost small icon-only" aria-label="Person bearbeiten" title="Person bearbeiten" onClick={() => editMember(m)}>
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>{" "}
                    <button className="btn danger small icon-only" aria-label="Person löschen" title="Person löschen" onClick={() => removeMember(m.id)}>
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
      </Section>

      <div className="grid-2">
        <Section title="Termine" action={<button className="btn icon-only" aria-label="Termin anlegen" title="Termin anlegen" onClick={addAppointment}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Termin anlegen</span></button>}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn ghost small icon-only" aria-label={calendarView === "month" ? "Vorheriger Monat" : "Vorherige Woche"} title={calendarView === "month" ? "Vorheriger Monat" : "Vorherige Woche"} onClick={() => setMonthCursor((m) => calendarView === "month" ? addMonth(m, -1) : addDaysDate(m, -7))}>
                <i className="fa-solid fa-chevron-left" aria-hidden />
                <span className="sr-only">Vorheriger Monat</span>
              </button>
              <strong style={{ minWidth: 170, textAlign: "center" }}>
                {calendarView === "month" ? monthCursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : weekLabel}
              </strong>
              <button className="btn ghost small icon-only" aria-label={calendarView === "month" ? "Nächster Monat" : "Nächste Woche"} title={calendarView === "month" ? "Nächster Monat" : "Nächste Woche"} onClick={() => setMonthCursor((m) => calendarView === "month" ? addMonth(m, 1) : addDaysDate(m, 7))}>
                <i className="fa-solid fa-chevron-right" aria-hidden />
                <span className="sr-only">Nächster Monat</span>
              </button>
              <div className="spacer" />
              <button className={`chip ${calendarView === "month" ? "on" : ""}`} onClick={() => setCalendarView("month")}>Monat</button>
              <button className={`chip ${calendarView === "week" ? "on" : ""}`} onClick={() => setCalendarView("week")}>Woche</button>
              <button className={`chip ${onlyTomorrowWindow ? "on" : ""}`} onClick={() => setOnlyTomorrowWindow((v) => !v)}>Heute + Morgen</button>
              <button className="btn ghost small" onClick={() => setMonthCursor(new Date())}>Heute</button>
            </div>

            <div className="filters" style={{ marginBottom: 10 }}>
              {APPOINTMENT_CATEGORIES.map((c) => (
                <button key={c.value} className={`chip ${visibleCategories.includes(c.value) ? "on" : ""}`} onClick={() => toggleCategory(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="family-calendar">
              {[
                "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So",
              ].map((wd) => <div key={wd} className="family-calendar-wd">{wd}</div>)}

              <div className="family-calendar-legend">
                {APPOINTMENT_CATEGORIES.map((c) => (
                  <span key={c.value} className={`badge appt-cat-${c.value}`}>{c.label}</span>
                ))}
                <span className="badge important-date">Wichtige Daten</span>
              </div>

              {calendarCells.map((cell) => {
                const items = apptByDay.get(cell.iso) ?? [];
                const importantItems = importantByDay.get(cell.iso) ?? [];
                const dayDistance = daysUntil(cell.iso) ?? 999;
                const hasNearReminder = (items.length + importantItems.length) > 0 && dayDistance >= 0 && dayDistance <= 2;
                const cellTooltipLines: string[] = [];
                for (const d of importantItems) {
                  cellTooltipLines.push(`• ${d.title} (Wichtiges Datum)`);
                }
                for (const a of items) {
                  const when = dateTime(a.startsAt);
                  const cat = categoryLabel(a.category);
                  cellTooltipLines.push(`• ${a.title} (${cat}, ${when})`);
                }
                const cellTitle = cellTooltipLines.length > 0
                  ? `${shortDate(cell.iso)}\n${cellTooltipLines.join("\n")}`
                  : "Termin anlegen";
                return (
                  <div
                    key={cell.iso}
                    className={`family-calendar-cell ${cell.inMonth ? "" : "out"} ${(items.length + importantItems.length) > 0 ? "has-items" : ""}`}
                    title={cellTitle}
                  >
                    <div className="calendar-cell-head">
                      <span className="day">{cell.day}</span>
                      {hasNearReminder && <span className="calendar-reminder-dot" title="Erinnerung in den nächsten 2 Tagen" />}
                      <button
                        className="btn ghost small icon-only calendar-add-btn"
                        title="Termin anlegen"
                        aria-label="Termin anlegen"
                        onClick={() => addAppointmentAtDate(cell.iso)}
                      >
                        <i className="fa-solid fa-plus" aria-hidden />
                        <span className="sr-only">Termin anlegen</span>
                      </button>
                    </div>
                    {importantItems.slice(0, 2).map((d) => (
                      <span
                        key={`imp-${d.id}`}
                        className="appt important-date"
                        title={importantDateTooltip(d, cell.iso)}
                      >
                        {d.title}
                      </span>
                    ))}
                    {items.slice(0, 2).map((a) => (
                      <span
                        key={a.id}
                        className={`appt appt-cat-${normalizeCategory(a.category)}`}
                        title={appointmentTooltip(a, memberNameById)}
                      >
                        <span className="appt-title">{a.title}</span>
                        <button
                          className="appt-done-btn"
                          title="Termin als erledigt markieren"
                          aria-label="Termin als erledigt markieren"
                          onClick={(e) => {
                            e.stopPropagation();
                            void completeAppointment(a);
                          }}
                        >
                          <i className="fa-solid fa-check" aria-hidden />
                        </button>
                      </span>
                    ))}
                    {(importantItems.length + items.length) > 4 && <span className="appt more">+{(importantItems.length + items.length) - 4}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {upcoming.length === 0
            ? <Empty title="Keine offenen Termine." hint="Neue Termine erscheinen hier, sobald du sie anlegst." />
            : <div className="card">
                <table>
                  <tbody>
                    {upcoming.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.title}</strong>
                          <div className="alert-msg">
                            {categoryLabel(a.category)} · {dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}
                            {a.familyMemberId ? ` · ${memberNameById.get(a.familyMemberId) ?? "Person"}` : ""}
                          </div>
                        </td>
                        <td className="num">
                          <span className="badge">{countdown(daysUntil(a.startsAt.slice(0, 10)))}</span>
                        </td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button className="btn ghost small icon-only" aria-label="Termin als erledigt markieren" title="Termin als erledigt markieren" onClick={() => completeAppointment(a)}>
                            <i className="fa-solid fa-check" aria-hidden />
                            <span className="sr-only">Erledigt</span>
                          </button>
                          <button className="btn ghost small icon-only" aria-label="Termin bearbeiten" title="Termin bearbeiten" onClick={() => editAppointment(a)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          {doneAppointments.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <strong>Erledigte Termine</strong>
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {doneAppointments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.title}</strong>
                          <div className="alert-msg">
                            {categoryLabel(a.category)} · {dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}
                            {a.familyMemberId ? ` · ${memberNameById.get(a.familyMemberId) ?? "Person"}` : ""}
                          </div>
                      </td>
                      <td className="num action-cell">
                        <div className="action-stack">
                        <button className="btn ghost small icon-only" aria-label="Termin wieder öffnen" title="Termin wieder öffnen" onClick={() => reopenAppointment(a)}>
                          <i className="fa-solid fa-rotate-left" aria-hidden />
                          <span className="sr-only">Wieder öffnen</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
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
        </Section>
      </div>

      <Section title="Wichtige Daten" action={<button className="btn icon-only" aria-label="Datum anlegen" title="Datum anlegen" onClick={addDate}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Datum anlegen</span></button>}>
        {(dates.data ?? []).length === 0
          ? <Empty title="Noch keine wichtigen Daten." hint="Geburtstage und Jahrestage erinnern dich rechtzeitig." />
          : <div className="card">
              <table>
                <thead><tr><th>Anlass</th><th>Datum</th><th>Wiederholung</th><th className="num">Countdown</th><th className="num action-col">Aktion</th></tr></thead>
                <tbody>
                  {(dates.data ?? []).map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.title}</strong></td>
                      <td>{shortDate(d.dateValue)}</td>
                      <td>{d.repeatsYearly ? "jährlich" : "einmalig"}</td>
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
            </div>}
      </Section>
    </>
  );
}
