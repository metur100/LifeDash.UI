import { useMemo, useState } from "react";
import AlertDetailsDialog from "./AlertDetailsDialog";
import type { Alert } from "../api/types";
import { countdown, localDateIso, shortDate } from "../lib/format";

/**
 * The signature element: every deadline in the next N days laid out as a
 * compact Mo-So calendar (same look as the Termine calendar). Overdue items
 * can't sit on a future grid, so they get their own strip above it.
 */
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CELL_LIMIT = 3;

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function dueIso(a: Alert): string | null {
  if (a.dueOn) return a.dueOn.slice(0, 10);
  return a.daysLeft === null ? null : localDateIso(addDays(new Date(), a.daysLeft));
}

export default function Horizon({ alerts, horizon = 30 }:
  { alerts: Alert[]; horizon?: number }) {
  const [selected, setSelected] = useState<Alert | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayIso = localDateIso(todayDate);
  const lastIso = localDateIso(addDays(todayDate, horizon));

  const overdue = alerts
    .filter((a) => a.daysLeft !== null && a.daysLeft < 0)
    .sort((a, b) => a.daysLeft! - b.daysLeft!);

  const byDay = useMemo(() => {
    const map = new Map<string, Alert[]>();
    for (const a of alerts) {
      if (a.daysLeft === null || a.daysLeft < 0 || a.daysLeft > horizon) continue;
      const iso = dueIso(a);
      if (!iso) continue;
      const list = map.get(iso) ?? [];
      list.push(a);
      map.set(iso, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.severity - a.severity);
    return map;
  }, [alerts, horizon]);

  // Whole weeks from this Monday until the Sunday after the horizon's last day.
  const cells = useMemo(() => {
    const base = new Date(`${todayIso}T00:00:00`);
    const start = startOfWeek(base);
    const end = addDays(startOfWeek(addDays(base, horizon)), 6);
    const out: Array<{ iso: string; date: Date }> = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push({ iso: localDateIso(d), date: d });
    return out;
  }, [todayIso, horizon]);

  const open = (a: Alert) => setSelected(a);

  return (
    <div className="horizon">
      <div className="horizon-head">
        <span className="horizon-title">Fristen-Horizont · nächste {horizon} Tage</span>
        <div className="horizon-legend" aria-hidden>
          <span title="Termin oder Frist liegt bereits in der Vergangenheit — sofort erledigen."><i className="dot" style={{ background: "var(--danger)" }} />überfällig</span>
          <span title="Fällig in den nächsten 7 Tagen."><i className="dot" style={{ background: "var(--warning)" }} />dringend</span>
          <span title="Fällig in 8 bis 20 Tagen."><i className="dot" style={{ background: "var(--accent)" }} />bald</span>
          <span title="Liegt weiter in der Zukunft, aber noch im Anzeigezeitraum."><i className="dot" style={{ background: "var(--text-soft)" }} />später</span>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="horizon-overdue">
          <span className="horizon-overdue-label">Überfällig</span>
          {overdue.map((a) => (
            <button key={a.id} type="button" className="badge red"
              title={`${a.title} — ${a.message}`} onClick={() => open(a)}>
              {a.title} · {countdown(a.daysLeft)}
            </button>
          ))}
        </div>
      )}

      <div className="family-calendar month-view horizon-cal">
        {WEEKDAYS.map((wd) => <div key={wd} className="family-calendar-wd">{wd}</div>)}

        {cells.map((cell) => {
          const inWindow = cell.iso >= todayIso && cell.iso <= lastIso;
          const items = byDay.get(cell.iso) ?? [];
          const showAll = expanded.has(cell.iso);
          const visible = showAll ? items : items.slice(0, CELL_LIMIT);
          const hidden = items.length - visible.length;
          const isToday = cell.iso === todayIso;
          const firstOfMonth = cell.date.getDate() === 1;
          return (
            <div key={cell.iso}
              className={`family-calendar-cell ${inWindow ? "" : "out"} ${items.length > 0 ? "has-items" : ""} ${isToday ? "today" : ""}`}
              title={items.length > 0 ? `${shortDate(cell.iso)}\n${items.map((a) => `• ${a.title}`).join("\n")}` : undefined}>
              <div className="calendar-cell-head">
                <span className="day">
                  {cell.date.getDate()}{firstOfMonth && `. ${cell.date.toLocaleDateString("de-DE", { month: "short" })}`}
                  {isToday && <span className="sr-only"> (heute)</span>}
                </span>
              </div>
              {visible.map((a) => (
                <button key={a.id} type="button" className={`appt hz-sev-${a.severity}`}
                  title={`${a.title} — ${a.message}`}
                  aria-label={`${a.title}, ${countdown(a.daysLeft)}`}
                  onClick={() => open(a)}>
                  <span className="appt-title">{a.title}</span>
                </button>
              ))}
              {hidden > 0 && (
                <button type="button" className="appt more" title="Alle Fristen dieses Tages zeigen"
                  onClick={() => setExpanded((s) => new Set(s).add(cell.iso))}>
                  +{hidden}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDetailsDialog alert={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
