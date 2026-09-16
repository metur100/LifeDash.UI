import type { Subscription } from "../api/types";
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

export default function ContractsTimeline({ subscriptions }: { subscriptions: Subscription[] }) {
  const rows = subscriptions
    .map((s) => {
      const referenceEnd = s.endOn ?? s.cancelByOn ?? s.renewsOn ?? null;
      if (!referenceEnd) return null;
      const startOffsetRaw = daysUntil(s.startOn ?? referenceEnd) ?? 0;
      const endOffsetRaw = daysUntil(referenceEnd) ?? 0;
      if (endOffsetRaw < 0 || startOffsetRaw > WINDOW_DAYS) return null;

      const start = Math.max(0, startOffsetRaw);
      const end = Math.min(WINDOW_DAYS, Math.max(endOffsetRaw, start));
      const cancelOffsetRaw = s.cancelByOn ? daysUntil(s.cancelByOn) : null;
      const cancelOffset = cancelOffsetRaw !== null && cancelOffsetRaw >= 0 && cancelOffsetRaw <= WINDOW_DAYS ? cancelOffsetRaw : null;

      const noteLabel = s.cancelByOn
        ? `Kündigen bis ${shortDate(s.cancelByOn)}`
        : s.endOn
          ? `Ende ${shortDate(s.endOn)}`
          : `Verlängert am ${shortDate(s.renewsOn)}`;

      return { s, start, end, cancelOffset, noteLabel };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.end - b.end);

  if (rows.length === 0) return null;

  const ticks = monthTicks();

  return (
    <Section title="Vertragslaufzeiten im Jahresüberblick">
      <div className="card">
        <div className="gantt">
          {rows.map(({ s, start, end, cancelOffset, noteLabel }) => {
            const left = (start / WINDOW_DAYS) * 100;
            const width = Math.max(1.2, ((end - start) / WINDOW_DAYS) * 100);
            return (
              <div className="gantt-row" key={s.id}>
                <div className="gantt-label" title={s.name}>
                  <strong>{s.name}</strong>
                  <span>{noteLabel}</span>
                </div>
                <div className="gantt-track">
                  <div
                    className="gantt-bar"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${s.name} · ${shortDate(s.startOn)} – ${shortDate(s.endOn ?? s.renewsOn)}`}
                  />
                  {cancelOffset !== null && (
                    <div
                      className="gantt-marker"
                      style={{ left: `${(cancelOffset / WINDOW_DAYS) * 100}%` }}
                      data-label="Kündigen bis"
                      title={`Kündigungsfrist: ${shortDate(s.cancelByOn)}`}
                    />
                  )}
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
