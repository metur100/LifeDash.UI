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
  allergies: string;
  medication: string;
  birthPlace: string;
  secondNationality: string;
  taxId: string;
  identificationNo: string;
  pensionNo: string;
  healthInsurance: string;
  healthInsuranceNo: string;
  idCardNo: string;
  passportNo: string;
  passportIssuedOn: string;
  passportExpiresOn: string;
  passportNo2: string;
  passportIssuedOn2: string;
  passportExpiresOn2: string;
  address: string;
  address2: string;
  iban: string;
};

const META_START = "[profile-meta]";
const META_END = "[/profile-meta]";
const IMPORTANT_META_START = "[important-meta]";
const IMPORTANT_META_END = "[/important-meta]";

function parsePersonMeta(notes?: string | null): { meta: PersonMeta } {
  const empty: PersonMeta = {
    heightCm: "",
    weightKg: "",
    allergies: "",
    medication: "",
    birthPlace: "",
    secondNationality: "",
    taxId: "",
    identificationNo: "",
    pensionNo: "",
    healthInsurance: "",
    healthInsuranceNo: "",
    idCardNo: "",
    passportNo: "",
    passportIssuedOn: "",
    passportExpiresOn: "",
    passportNo2: "",
    passportIssuedOn2: "",
    passportExpiresOn2: "",
    address: "",
    address2: "",
    iban: "",
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
      allergies: kv.get("allergies") ?? "",
      medication: kv.get("medication") ?? "",
      birthPlace: kv.get("birthPlace") ?? "",
      secondNationality: kv.get("secondNationality") ?? "",
      taxId: kv.get("taxId") ?? "",
      identificationNo: kv.get("identificationNo") ?? "",
      pensionNo: kv.get("pensionNo") ?? "",
      healthInsurance: kv.get("healthInsurance") ?? "",
      healthInsuranceNo: kv.get("healthInsuranceNo") ?? "",
      idCardNo: kv.get("idCardNo") ?? "",
      passportNo: kv.get("passportNo") ?? "",
      passportIssuedOn: kv.get("passportIssuedOn") ?? "",
      passportExpiresOn: kv.get("passportExpiresOn") ?? "",
      passportNo2: kv.get("passportNo2") ?? "",
      passportIssuedOn2: kv.get("passportIssuedOn2") ?? "",
      passportExpiresOn2: kv.get("passportExpiresOn2") ?? "",
      address: kv.get("address") ?? "",
      address2: kv.get("address2") ?? "",
      iban: kv.get("iban") ?? "",
    },
  };
}

function buildPersonNotes(meta: PersonMeta): string | null {
  const lines = [
    `heightCm:${meta.heightCm.trim()}`,
    `weightKg:${meta.weightKg.trim()}`,
    `allergies:${meta.allergies.trim()}`,
    `medication:${meta.medication.trim()}`,
    `birthPlace:${meta.birthPlace.trim()}`,
    `secondNationality:${meta.secondNationality.trim()}`,
    `taxId:${meta.taxId.trim()}`,
    `identificationNo:${meta.identificationNo.trim()}`,
    `pensionNo:${meta.pensionNo.trim()}`,
    `healthInsurance:${meta.healthInsurance.trim()}`,
    `healthInsuranceNo:${meta.healthInsuranceNo.trim()}`,
    `idCardNo:${meta.idCardNo.trim()}`,
    `passportNo:${meta.passportNo.trim()}`,
    `passportIssuedOn:${meta.passportIssuedOn.trim()}`,
    `passportExpiresOn:${meta.passportExpiresOn.trim()}`,
    `passportNo2:${meta.passportNo2.trim()}`,
    `passportIssuedOn2:${meta.passportIssuedOn2.trim()}`,
    `passportExpiresOn2:${meta.passportExpiresOn2.trim()}`,
    `address:${meta.address.trim()}`,
    `address2:${meta.address2.trim()}`,
    `iban:${meta.iban.trim()}`,
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

const importantDateCategoryLabelByValue = new Map(IMPORTANT_DATE_CATEGORIES.map((x) => [x.value, x.label]));

function importantDateCategoryLabel(category?: string | null): string {
  const key = String(category ?? "").trim().toLowerCase();
  return importantDateCategoryLabelByValue.get(key) ?? "Sonstiges";
}

const PERSON_ROLE_OPTIONS = [
  { value: "", label: "-" },
  { value: "Ich", label: "Ich" },
  { value: "Mutter", label: "Mutter" },
  { value: "Vater", label: "Vater" },
  { value: "Schwester", label: "Schwester" },
  { value: "Bruder", label: "Bruder" },
  { value: "Ehepartner", label: "Ehepartner" },
  { value: "Sohn", label: "Sohn" },
  { value: "Tochter", label: "Tochter" },
  { value: "Sonstige", label: "Sonstige" },
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

function attendeeNames(ids: number[], memberNameById: Map<number, string>): string {
  return ids.map((id) => memberNameById.get(id) ?? "Person").join(", ");
}

function appointmentTooltip(a: Appointment, memberNameById: Map<number, string>): string {
  const lines = [
    a.title,
    `Kategorie: ${categoryLabel(a.category)}`,
    `Zeit: ${dateTime(a.startsAt)}`,
  ];
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

export default function Family() {
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const appts = useAsync<Appointment[]>(() => api.get("/api/appointments"), []);
  const dates = useAsync<ImportantDate[]>(() => api.get("/api/important-dates"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [detailsMember, setDetailsMember] = useState<FamilyMember | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => monthStartDate(new Date()));
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [closeDetailsOnBackdropClick, setCloseDetailsOnBackdropClick] = useState(false);

  async function addMember() {
    const values = await dialog.form({
      title: "Person hinzufügen",
      submitText: "Anlegen",
      fields: [
        { key: "sec-basic", label: "Basis", type: "section" },
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: PERSON_ROLE_OPTIONS },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "secondNationality", label: "Zweite Staatsangehörigkeit" },
        { key: "birthPlace", label: "Geburtsort" },

        { key: "sec-docs", label: "Dokumente und Nummern", type: "section" },
        { key: "taxId", label: "Steuernummer" },
        { key: "identificationNo", label: "Identifikationsnummer" },
        { key: "pensionNo", label: "Rentenversicherungsnummer" },
        { key: "healthInsurance", label: "Krankenversicherung" },
        { key: "idCardNo", label: "Ausweisnummer" },
        { key: "jmbg", label: "JMBG" },
        { key: "passportNo", label: "Passnummer 1" },
        { key: "passportIssuedOn", label: "Pass 1 ausgestellt am", type: "date" },
        { key: "passportExpiresOn", label: "Pass 1 gültig bis", type: "date" },
        { key: "passportNo2", label: "Passnummer 2" },
        { key: "passportIssuedOn2", label: "Pass 2 ausgestellt am", type: "date" },
        { key: "passportExpiresOn2", label: "Pass 2 gültig bis", type: "date" },
        { key: "address", label: "Anschrift 1" },
        { key: "address2", label: "Anschrift 2" },
        { key: "iban", label: "IBAN" },

        { key: "sec-health", label: "Gesundheit", type: "section" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: "",
        relation: "",
        birthDate: "",
        nationality: "",
        secondNationality: "",
        birthPlace: "",
        taxId: "",
        identificationNo: "",
        pensionNo: "",
        healthInsurance: "",
        healthInsuranceNo: "",
        idCardNo: "",
        jmbg: "",
        passportNo: "",
        passportIssuedOn: "",
        passportExpiresOn: "",
        passportNo2: "",
        passportIssuedOn2: "",
        passportExpiresOn2: "",
        address: "",
        address2: "",
        iban: "",
        heightCm: "",
        weightKg: "",
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
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
        birthPlace: String(values.birthPlace ?? ""),
        secondNationality: String(values.secondNationality ?? ""),
        taxId: String(values.taxId ?? ""),
        identificationNo: String(values.identificationNo ?? ""),
        pensionNo: String(values.pensionNo ?? ""),
        healthInsurance: String(values.healthInsurance ?? ""),
        healthInsuranceNo: String(values.healthInsuranceNo ?? ""),
        idCardNo: String(values.idCardNo ?? ""),
        passportNo: String(values.passportNo ?? ""),
        passportIssuedOn: String(values.passportIssuedOn ?? ""),
        passportExpiresOn: String(values.passportExpiresOn ?? ""),
        passportNo2: String(values.passportNo2 ?? ""),
        passportIssuedOn2: String(values.passportIssuedOn2 ?? ""),
        passportExpiresOn2: String(values.passportExpiresOn2 ?? ""),
        address: String(values.address ?? ""),
        address2: String(values.address2 ?? ""),
        iban: String(values.iban ?? ""),
      });

      await api.post("/api/family-members", {
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        jmbg: String(values.jmbg ?? "").trim() || null,
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
        { key: "sec-basic", label: "Basis", type: "section" },
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: PERSON_ROLE_OPTIONS },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "secondNationality", label: "Zweite Staatsangehörigkeit" },
        { key: "birthPlace", label: "Geburtsort" },

        { key: "sec-docs", label: "Dokumente und Nummern", type: "section" },
        { key: "taxId", label: "Steuernummer" },
        { key: "identificationNo", label: "Identifikationsnummer" },
        { key: "pensionNo", label: "Rentenversicherungsnummer" },
        { key: "healthInsurance", label: "Krankenversicherung" },
        { key: "idCardNo", label: "Ausweisnummer" },
        { key: "jmbg", label: "JMBG" },
        { key: "passportNo", label: "Passnummer 1" },
        { key: "passportIssuedOn", label: "Pass 1 ausgestellt am", type: "date" },
        { key: "passportExpiresOn", label: "Pass 1 gültig bis", type: "date" },
        { key: "passportNo2", label: "Passnummer 2" },
        { key: "passportIssuedOn2", label: "Pass 2 ausgestellt am", type: "date" },
        { key: "passportExpiresOn2", label: "Pass 2 gültig bis", type: "date" },
        { key: "address", label: "Anschrift 1" },
        { key: "address2", label: "Anschrift 2" },
        { key: "iban", label: "IBAN" },

        { key: "sec-health", label: "Gesundheit", type: "section" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: m.fullName,
        relation: m.relation ?? "",
        birthDate: m.birthDate ?? "",
        nationality: m.nationality ?? "",
        secondNationality: parsed.meta.secondNationality,
        birthPlace: parsed.meta.birthPlace,
        taxId: parsed.meta.taxId,
        identificationNo: parsed.meta.identificationNo,
        pensionNo: parsed.meta.pensionNo,
        healthInsurance: parsed.meta.healthInsurance,
        healthInsuranceNo: parsed.meta.healthInsuranceNo,
        idCardNo: parsed.meta.idCardNo,
        jmbg: m.jmbg ?? "",
        passportNo: parsed.meta.passportNo,
        passportIssuedOn: parsed.meta.passportIssuedOn,
        passportExpiresOn: parsed.meta.passportExpiresOn,
        passportNo2: parsed.meta.passportNo2,
        passportIssuedOn2: parsed.meta.passportIssuedOn2,
        passportExpiresOn2: parsed.meta.passportExpiresOn2,
        address: parsed.meta.address,
        address2: parsed.meta.address2,
        iban: parsed.meta.iban,
        heightCm: parsed.meta.heightCm,
        weightKg: parsed.meta.weightKg,
        allergies: parsed.meta.allergies,
        medication: parsed.meta.medication,
      },
    });
    if (!values) return;

    try {
      const notes = buildPersonNotes({
        heightCm: String(values.heightCm ?? ""),
        weightKg: String(values.weightKg ?? ""),
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
        birthPlace: String(values.birthPlace ?? ""),
        secondNationality: String(values.secondNationality ?? ""),
        taxId: String(values.taxId ?? ""),
        identificationNo: String(values.identificationNo ?? ""),
        pensionNo: String(values.pensionNo ?? ""),
        healthInsurance: String(values.healthInsurance ?? ""),
        healthInsuranceNo: String(values.healthInsuranceNo ?? ""),
        idCardNo: String(values.idCardNo ?? ""),
        passportNo: String(values.passportNo ?? ""),
        passportIssuedOn: String(values.passportIssuedOn ?? ""),
        passportExpiresOn: String(values.passportExpiresOn ?? ""),
        passportNo2: String(values.passportNo2 ?? ""),
        passportIssuedOn2: String(values.passportIssuedOn2 ?? ""),
        passportExpiresOn2: String(values.passportExpiresOn2 ?? ""),
        address: String(values.address ?? ""),
        address2: String(values.address2 ?? ""),
        iban: String(values.iban ?? ""),
      });

      await api.put(`/api/family-members/${m.id}`, {
        ...m,
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        jmbg: String(values.jmbg ?? "").trim() || null,
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
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
      ],
      initial: {
        title: a.title,
        startsAt: toLocalDateTimeInput(a.startsAt),
        location: a.location ?? "",
        category: normalizeCategory(a.category),
        attendeeIds: a.attendeeIds.join(","),
      },
    });
    if (!values) return;

    try {
      const payload = {
        title: String(values.title).trim(),
        startsAt: fromDateTimeInput(values.startsAt) ?? a.startsAt,
        location: String(values.location).trim() || null,
        category: normalizeCategory(String(values.category)),
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
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
        { key: "category", label: "Kategorie", type: "select", options: IMPORTANT_DATE_CATEGORIES },
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
        { key: "category", label: "Kategorie", type: "select", options: APPOINTMENT_CATEGORIES },
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
      ],
      initial: {
        title: "",
        startsAt: "",
        location: "",
        category: "family",
        attendeeIds: "",
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
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
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
        { key: "attendeeIds", label: "Personen", type: "multiselect", options: memberOptions.slice(1) },
      ],
      initial: {
        title: "",
        startsAt: `${dayIso}T09:00`,
        location: "",
        category: "family",
        attendeeIds: "",
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
        attendeeIds: String(values.attendeeIds ?? "").split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n > 0),
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
        { key: "category", label: "Kategorie", type: "select", options: IMPORTANT_DATE_CATEGORIES },
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

  const upcoming = (appts.data ?? [])
    .filter((a) => !a.isDone)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const doneAppointments = (appts.data ?? [])
    .filter((a) => a.isDone)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const memberNameById = new Map((members.data ?? []).map((m) => [m.id, m.fullName]));
  const apptByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of (appts.data ?? []).filter((x) => !x.isDone)) {
      const day = a.startsAt.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(a);
      map.set(day, list);
    }
    return map;
  }, [appts.data]);

  const importantByDay = useMemo(() => {
    const map = new Map<string, ImportantDate[]>();
    for (const d of (dates.data ?? [])) {
      const iso = occurrenceInMonth(d, monthCursor);
      if (!iso) continue;
      const list = map.get(iso) ?? [];
      list.push(d);
      map.set(iso, list);
    }
    return map;
  }, [dates.data, monthCursor]);

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

  async function copyValue(field: string, value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 1400);
    } catch {
      setError("Kopieren nicht möglich.");
    }
  }

  return (
    <>
      <PageHead eyebrow="Familie" title="Wer wann was braucht"
        lede="Personen, Termine und wichtige Daten fuer dein Familien- und Erwachsenenleben." />
      <ErrorBar message={error ?? members.error ?? appts.error} />

      <Section title="Personen" action={<button className="btn icon-only" aria-label="Person hinzufügen" title="Person hinzufügen" onClick={addMember}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Person hinzufügen</span></button>}>
        {(members.data ?? []).length === 0
          ? <Empty title="Noch keine Personen." hint="Lege Familienmitglieder an, um Termine und Dokumente zuzuordnen." />
          : <div className="card">
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Name</th><th>Rolle</th><th>Geburtstag</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {(members.data ?? []).map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.fullName}</strong></td>
                        <td>{m.relation ?? "—"}</td>
                        <td>{shortDate(m.birthDate)}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button
                            className="btn ghost small icon-only"
                            aria-label="Personendetails"
                            title="Personendetails"
                            onClick={() => {
                              setCopiedField(null);
                              setDetailsMember(m);
                            }}
                          >
                            <i className="fa-solid fa-circle-info" aria-hidden />
                            <span className="sr-only">Personendetails</span>
                          </button>{" "}
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

              <div className="rtable-cards">
                {(members.data ?? []).map((m) => (
                  <div key={`m-${m.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{m.fullName}</strong>
                      <span className="badge">{m.relation ?? "—"}</span>
                    </div>
                    <div className="alert-msg">Geburtstag: {shortDate(m.birthDate)}</div>
                    <div className="action-stack mobile-card-actions">
                      <button
                        className="btn ghost small icon-only"
                        aria-label="Personendetails"
                        title="Personendetails"
                        onClick={() => {
                          setCopiedField(null);
                          setDetailsMember(m);
                        }}
                      >
                        <i className="fa-solid fa-circle-info" aria-hidden />
                        <span className="sr-only">Personendetails</span>
                      </button>
                      <button className="btn ghost small icon-only" aria-label="Person bearbeiten" title="Person bearbeiten" onClick={() => editMember(m)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Person löschen" title="Person löschen" onClick={() => removeMember(m.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
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
              <button className="btn ghost small" onClick={() => setMonthCursor(new Date())}>Heute</button>
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
                      <span className="day">{cell.day}</span>
                      {hasNearReminder && <span className="calendar-reminder-dot" title="Erinnerung in den nächsten 2 Tagen" />}
                    </div>
                    {importantItems.map((d) => (
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
                        {d.title}
                      </span>
                    ))}
                    {items.map((a) => (
                      <span
                        key={a.id}
                        className={`appt appt-cat-${normalizeCategory(a.category)}`}
                        title={appointmentTooltip(a, memberNameById)}
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
                  </div>
                );
              })}
            </div>
          </div>

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
                        {categoryLabel(a.category)} · {dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}
                        {a.attendeeIds.length > 0 ? ` · ${attendeeNames(a.attendeeIds, memberNameById)}` : ""}
                      </div>
                      <div className="action-stack mobile-card-actions">
                        <button className="btn ghost small icon-only" aria-label="Termin als erledigt markieren" title="Termin als erledigt markieren" onClick={() => completeAppointment(a)}>
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
                    </div>
                    <div className="action-stack mobile-card-actions">
                      <button className="btn ghost small icon-only" aria-label="Termin wieder öffnen" title="Termin wieder öffnen" onClick={() => reopenAppointment(a)}>
                        <i className="fa-solid fa-rotate-left" aria-hidden />
                        <span className="sr-only">Wieder öffnen</span>
                      </button>
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
      </div>

      <Section title="Wichtige Anlässe" action={<button className="btn icon-only" aria-label="Datum anlegen" title="Datum anlegen" onClick={addDate}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Datum anlegen</span></button>}>
        {(dates.data ?? []).length === 0
          ? <Empty title="Noch keine wichtigen Anlässe." hint="Geburtstage, Jahrestage und weitere wiederkehrende Anlässe erscheinen hier." />
          : <div className="card">
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Anlass</th><th>Kategorie</th><th>Datum</th><th>Wiederholung</th><th className="num">Countdown</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {(dates.data ?? []).map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.title}</strong></td>
                        <td><span className={`badge important-date-cat-${(d.category || "other").toLowerCase()}`}>{importantDateCategoryLabel(d.category)}</span></td>
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
                {(dates.data ?? []).map((d) => (
                  <div key={`m-${d.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{d.title}</strong>
                      <span className={`badge important-date-cat-${(d.category || "other").toLowerCase()}`}>{importantDateCategoryLabel(d.category)}</span>
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

      {detailsMember && (
        <div
          className="dlg-backdrop"
          role="presentation"
          onMouseDown={(e) => setCloseDetailsOnBackdropClick(e.target === e.currentTarget)}
          onClick={(e) => {
            if (e.target === e.currentTarget && closeDetailsOnBackdropClick) {
              setDetailsMember(null);
            }
            setCloseDetailsOnBackdropClick(false);
          }}
        >
          <div className="dlg person-details-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>Personendetails</h3>
            </div>
            {copiedField && <div className="badge green" style={{ marginBottom: 8 }}>{copiedField} kopiert</div>}
            <div className="form-grid person-details-grid" style={{ marginBottom: 10 }}>
              {(() => {
                const meta = parsePersonMeta(detailsMember.notes).meta;
                const groups = [
                  {
                    title: "Basis",
                    rows: [
                      ["Name", detailsMember.fullName],
                      ["Rolle", detailsMember.relation ?? ""],
                      ["Geburtsdatum", shortDate(detailsMember.birthDate)],
                      ["Geburtsort", meta.birthPlace],
                      ["Staatsangehörigkeit", detailsMember.nationality ?? ""],
                      ["Zweite Staatsangehörigkeit", meta.secondNationality],
                    ],
                  },
                  {
                    title: "Dokumente und Nummern",
                    rows: [
                      ["Steuernummer", meta.taxId],
                      ["Identifikationsnummer", meta.identificationNo],
                      ["Rentenversicherungsnummer", meta.pensionNo],
                      ["Ausweisnummer", meta.idCardNo],
                      ["JMBG", detailsMember.jmbg ?? ""],
                      ["Passnummer 1", meta.passportNo],
                      ["Pass 1 ausgestellt am", shortDate(meta.passportIssuedOn || null)],
                      ["Pass 1 gültig bis", shortDate(meta.passportExpiresOn || null)],
                      ["Passnummer 2", meta.passportNo2],
                      ["Pass 2 ausgestellt am", shortDate(meta.passportIssuedOn2 || null)],
                      ["Pass 2 gültig bis", shortDate(meta.passportExpiresOn2 || null)],
                      ["Krankenversicherung", meta.healthInsurance],
                      ["Anschrift 1", meta.address],
                      ["Anschrift 2", meta.address2],
                      ["IBAN", meta.iban],
                    ],
                  },
                  {
                    title: "Gesundheit",
                    rows: [
                      ["Größe (cm)", meta.heightCm],
                      ["Gewicht (kg)", meta.weightKg],
                      ["Allergien", meta.allergies],
                      ["Medikamente", meta.medication],
                    ],
                  },
                ] as Array<{ title: string; rows: Array<[string, string]> }>;

                return groups.flatMap((group) => [
                  <div key={`group-${group.title}`} className="dlg-section-title">{group.title}</div>,
                  ...group.rows.map(([label, value]) => {
                    const copied = copiedField === label;
                    const isCodeLikeField = [
                      "Steuernummer",
                      "Identifikationsnummer",
                      "Rentenversicherungsnummer",
                      "Ausweisnummer",
                      "JMBG",
                      "Passnummer 1",
                      "Passnummer 2",
                      "IBAN",
                    ].includes(label);
                    return (
                      <div key={label} className="person-detail-row">
                        <div className="person-detail-label">{label}</div>
                        <div className={`person-detail-value${isCodeLikeField ? " is-code" : ""}`} title={value || ""}>{value || "—"}</div>
                        <button
                          className="btn ghost small icon-only"
                          onClick={() => { void copyValue(label, value); }}
                          disabled={!value}
                          aria-label={copied ? `${label} kopiert` : `${label} kopieren`}
                          title={copied ? "Kopiert" : "Kopieren"}
                        >
                          <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden />
                          <span className="sr-only">{copied ? "Kopiert" : "Kopieren"}</span>
                        </button>
                      </div>
                    );
                  }),
                ]);
              })()}
            </div>
            <div className="dlg-actions">
              <button className="btn" onClick={() => setDetailsMember(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
