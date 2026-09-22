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
