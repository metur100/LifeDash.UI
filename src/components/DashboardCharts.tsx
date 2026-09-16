import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Alert } from "../api/types";
import { ChartTooltip } from "./charts/ChartTooltip";
import { severityLabel } from "../lib/format";
import { severityColor, useChartPalette } from "../lib/chartTheme";
import { Section } from "./Ui";

const WEEK_BUCKETS = 8;
const WEEK_DAYS = 7;

function bucketLabel(index: number, todayIso: string): string {
  if (index === WEEK_BUCKETS) return `${WEEK_BUCKETS * WEEK_DAYS}+ Tage`;
  const start = new Date(`${todayIso}T00:00:00`);
  start.setDate(start.getDate() + index * WEEK_DAYS);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(start);
}

export function AlertCompositionChart({ alerts }: { alerts: Alert[] }) {
  const palette = useChartPalette();

  const slices = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const a of alerts) counts[a.severity] += 1;
    return [3, 2, 1, 0].map((severity) => ({
      severity,
      name: severityLabel[severity],
      value: counts[severity],
      color: severityColor(palette, severity),
    })).filter((s) => s.value > 0);
  }, [alerts, palette]);

  const total = alerts.length;
  if (total === 0) return null;

  return (
    <Section title="Warnungen im Überblick" className="alert-composition">
      <div className="card">
        <div className="chart-box" style={{ position: "relative", height: 190 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%"
                   paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.severity} fill={s.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-pct" style={{ fontSize: 22 }}>{total}</div>
        </div>
        <div className="chart-legend">
          {slices.map((s) => (
            <span key={s.severity}>
              <i className="dot" style={{ background: s.color }} />
              {s.name} <strong>{s.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function UpcomingLoadChart({ alerts, horizonDays }: { alerts: Alert[]; horizonDays: number }) {
  const palette = useChartPalette();

  const buckets = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const counts = new Array(WEEK_BUCKETS + 1).fill(0);
    for (const a of alerts) {
      if (a.daysLeft === null || a.daysLeft < 0 || a.daysLeft > horizonDays) continue;
      const idx = Math.min(WEEK_BUCKETS, Math.floor(a.daysLeft / WEEK_DAYS));
      counts[idx] += 1;
    }
    return counts.map((count, i) => ({ label: bucketLabel(i, todayIso), count }));
  }, [alerts, horizonDays]);

  if (buckets.every((b) => b.count === 0)) return null;

  return (
    <Section title="Anstehende Last · nächste Wochen">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={buckets} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Bar dataKey="count" name="Fällig" fill={palette.accent} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
