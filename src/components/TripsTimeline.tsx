import { Link } from "react-router-dom";
import type { Trip } from "../api/types";
import { daysUntil, shortDate } from "../lib/format";
import { Section } from "./Ui";

const WINDOW_DAYS = 365;

function monthTicks(): Array<{ offset: number; label: string }> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const ticks: Array<{ offset: number; label: string }> = [];
  for (let i = 0; i <= 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    if (d <= now) continue;
    const offset = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    if (offset > WINDOW_DAYS) break;
    ticks.push({ offset, label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(d) });
  }
  return ticks;
}

export default function TripsTimeline({ trips }: { trips: Trip[] }) {
  const rows = trips
    .map((t) => {
      const startOffset = daysUntil(t.startsOn) ?? 0;
      const endOffset = daysUntil(t.endsOn ?? t.startsOn) ?? startOffset;
      const start = Math.max(0, startOffset);
      const end = Math.min(WINDOW_DAYS, Math.max(endOffset, start));
      return { trip: t, start, end, inWindow: endOffset >= 0 && startOffset <= WINDOW_DAYS };
    })
    .filter((r) => r.inWindow)
    .sort((a, b) => a.start - b.start);

  if (rows.length === 0) return null;

  const ticks = monthTicks();

  return (
    <Section title="Reisejahr im Überblick">
      <div className="card">
        <div className="gantt">
          {rows.map(({ trip, start, end }) => {
            const left = (start / WINDOW_DAYS) * 100;
            const width = Math.max(1.2, ((end - start) / WINDOW_DAYS) * 100);
            const current = start === 0 && end > 0;
            return (
              <div className="gantt-row" key={trip.id}>
                <Link className="gantt-label" to={`/travel/${trip.id}`} title={trip.title}>
                  <strong>{trip.title}</strong>
                  <span>{shortDate(trip.startsOn)}{trip.endsOn ? ` – ${shortDate(trip.endsOn)}` : ""}</span>
                </Link>
                <div className="gantt-track">
                  <div className={`gantt-bar${current ? " current" : ""}`}
                       style={{ left: `${left}%`, width: `${width}%` }}
                       title={`${trip.title} · ${trip.destination ?? "Ziel offen"}`} />
                </div>
              </div>
            );
          })}
          <div className="gantt-axis">
            <span />
            <div className="gantt-axis-track">
              {ticks.map((tick) => (
                <span key={tick.offset} className="gantt-axis-tick" style={{ left: `${(tick.offset / WINDOW_DAYS) * 100}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
