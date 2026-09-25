import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Alert, Appointment, FamilyMember, ImportantDate } from "../api/types";
import { APPOINTMENT_CATEGORIES, IMPORTANT_DATE_CATEGORIES } from "../lib/categories";
import type { Option } from "../lib/categories";
import { countdown, dateTime, severityLabel, shortDate } from "../lib/format";
import { recurrenceLabel } from "../lib/recurrence";
import { useCustomOptions } from "../lib/useCustomOptions";

const moduleLabel: Record<string, string> = {
  family: "Familie", authority: "Behörden", finance: "Finanzen",
  home: "Allgemein", travel: "Reisen", general: "Allgemein",
};

const severityBadge = ["", "", "amber", "red"];

type Row = [string, string | null | undefined];

function optionLabel(value: string | null | undefined, options: Option[]): string {
  const key = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.value === key)?.label ?? key;
}

// Notes can carry machine-readable "[xyz-meta] … [/xyz-meta]" blocks the edit forms rely on;
// they aren't meant for reading.
function readableNotes(notes?: string | null): string {
  return (notes ?? "").replace(/\[([a-z-]+-meta)\][\s\S]*?\[\/\1\]/g, "").trim();
}

// The linked record behind an alert, fetched on open. Only appointments and important dates have
// details worth showing beyond the alert itself; everything else links to its own page.
type Details =
  | { kind: "appointment"; appt: Appointment; members: FamilyMember[] }
  | { kind: "date"; date: ImportantDate; members: FamilyMember[] }
  | null;

/**
 * Read-only details for one dashboard entry (calendar or overdue strip). Shows the full record
 * where one exists, plus a button to jump to the section that owns it.
 */
export default function AlertDetailsDialog({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<Details>(null);
  const [loading, setLoading] = useState(false);
  const [backdropDown, setBackdropDown] = useState(false);
  const customApptCats = useCustomOptions("appointment-category");
  const customDateCats = useCustomOptions("important-date-category");

  useEffect(() => {
    setDetails(null);
    if (!alert || alert.relatedId == null) return;
    const id = alert.relatedId;
    let cancelled = false;

    async function load() {
      if (alert!.relatedType === "Appointment") {
        const [appts, members] = await Promise.all([
          api.get<Appointment[]>("/api/appointments"),
          api.get<FamilyMember[]>("/api/family-members"),
        ]);
        const appt = appts.find((a) => a.id === id);
        if (!cancelled && appt) setDetails({ kind: "appointment", appt, members });
      } else if (alert!.relatedType === "ImportantDate") {
        const [dates, members] = await Promise.all([
          api.get<ImportantDate[]>("/api/important-dates"),
          api.get<FamilyMember[]>("/api/family-members"),
        ]);
        const date = dates.find((d) => d.id === id);
        if (!cancelled && date) setDetails({ kind: "date", date, members });
      }
    }

    if (alert.relatedType === "Appointment" || alert.relatedType === "ImportantDate") {
      setLoading(true);
      load().catch(() => { /* fall back to the alert's own fields */ })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [alert]);

  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alert, onClose]);

  if (!alert) return null;

  const rows: Row[] = [
    ["Bereich", moduleLabel[alert.module] ?? alert.module],
    ["Fällig", alert.dueOn ? `${shortDate(alert.dueOn)} · ${countdown(alert.daysLeft)}` : countdown(alert.daysLeft)],
  ];
  let notes = "";

  if (details?.kind === "appointment") {
    const a = details.appt;
    const names = new Map(details.members.map((m) => [m.id, m.fullName]));
    const recurrence = recurrenceLabel(a.recurrence);
    rows.push(
      ["Kategorie", optionLabel(a.category, [...APPOINTMENT_CATEGORIES, ...customApptCats.options])],
      // A series' next occurrence comes from the alert; the stored startsAt is the series anchor.
      ["Beginn", recurrence ? `${shortDate(alert.dueOn)} ${a.startsAt.slice(11, 16)}` : dateTime(a.startsAt)],
      ["Ende", a.endsAt ? dateTime(a.endsAt) : null],
      ["Ort", a.location],
      ["Teilnehmer", a.attendeeIds.map((id) => names.get(id)).filter(Boolean).join(", ")],
      ["Wiederholung", recurrence ? `${recurrence}${a.recurrenceUntil ? ` bis ${shortDate(a.recurrenceUntil)}` : ""}` : null],
      // Mirrors ReminderEmailWorker; the stored reminderDays isn't used for appointments.
      ["Erinnerung", "1 Tag vorher und ca. 1 Std. vor Beginn (E-Mail)"],
    );
    notes = readableNotes(a.notes);
  } else if (details?.kind === "date") {
    const d = details.date;
    const person = details.members.find((m) => m.id === d.familyMemberId);
    rows.push(
      ["Kategorie", optionLabel(d.category, [...IMPORTANT_DATE_CATEGORIES, ...customDateCats.options])],
      ["Datum", shortDate(d.dateValue)],
      ["Person", person?.fullName],
      ["Wiederholung", d.repeatsYearly ? "jährlich" : null],
      ["Erinnerung", "Am Tag selbst (E-Mail)"],
    );
    notes = readableNotes(d.notes);
  }

  const shown = rows.filter(([, v]) => v != null && String(v).trim() !== "");

  return (
    <div className="dlg-backdrop" role="presentation"
      onMouseDown={(e) => setBackdropDown(e.target === e.currentTarget)}
      onClick={(e) => { if (e.target === e.currentTarget && backdropDown) onClose(); setBackdropDown(false); }}>
      <div className="dlg alert-details-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-details-title">
        <div className="dlg-head alert-details-head">
          <h3 id="alert-details-title">{details?.kind === "appointment" ? details.appt.title : alert.title}</h3>
          <span className={`badge ${severityBadge[alert.severity]}`}>{severityLabel[alert.severity]}</span>
        </div>
        <p className="dlg-text">{alert.message}</p>

        <div className="alert-details-grid">
          {shown.map(([label, value]) => (
            <div key={label} className="person-detail-row">
              <span className="person-detail-label">{label}</span>
              <span className="person-detail-value">{value}</span>
            </div>
          ))}
        </div>
        {loading && <p className="lede" style={{ marginTop: 10 }}>Details werden geladen …</p>}
        {notes && (
          <div className="alert-details-notes">
            <span className="person-detail-label">Notizen</span>
            <p>{notes}</p>
          </div>
        )}

        <div className="dlg-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Schließen</button>
          {alert.actionPath && (
            <button type="button" className="btn" onClick={() => { onClose(); navigate(alert.actionPath!); }}>
              {alert.actionLabel ?? "Öffnen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
