export const euro = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(n);

export const shortDate = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
        .format(new Date(iso)) : "—";

export const dateTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export const localDateIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const today = () => localDateIso(new Date());

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

export function countdown(days: number | null): string {
  if (days === null) return "kein Datum";
  if (days < -1) return `${Math.abs(days)} Tage überfällig`;
  if (days === -1) return "seit gestern";
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

export const severityLabel = ["Hinweis", "Bald", "Dringend", "Überfällig"];
