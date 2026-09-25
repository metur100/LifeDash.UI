export type Option = { value: string; label: string };

// Turns a user-typed label into a stable storage value, e.g. "Kfz-Versicherung" -> "kfz-versicherung".
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "sonstiges";
}

// Built-in categories for appointments and important dates; users can add their own on top.
export const APPOINTMENT_CATEGORIES = [
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

export const IMPORTANT_DATE_CATEGORIES = [
  { value: "birthday", label: "Geburtstag" },
  { value: "wedding", label: "Hochzeitstag" },
  { value: "anniversary", label: "Jahrestag" },
  { value: "other", label: "Sonstiges" },
];
