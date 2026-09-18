import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Appointment, FamilyMember } from "../api/types";
import { ChartTooltip } from "./charts/ChartTooltip";
import { useChartPalette } from "../lib/chartTheme";
import { daysUntil, shortDate, today } from "../lib/format";
import { Section } from "./Ui";

const WEEK_DAYS = 7;

function bucketLabel(index: number, weekBuckets: number, todayIso: string): string {
  if (index === weekBuckets) return `${weekBuckets * WEEK_DAYS}+ Tage`;
  const start = new Date(`${todayIso}T00:00:00`);
  start.setDate(start.getDate() + index * WEEK_DAYS);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(start);
}

export function AppointmentCategoryDonut({ categories }: { categories: Array<[string, number]> }) {
  const palette = useChartPalette();

  const slices = useMemo(() => {
    return categories.map(([name, value], i) => ({
      name,
      value,
      color: palette.categorical[i % palette.categorical.length],
    }));
  }, [categories, palette]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;

  return (
    <Section title="Termine nach Kategorie">
      <div className="card">
        <div className="chart-box" style={{ position: "relative", height: 190 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%"
                   paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-pct" style={{ fontSize: 22 }}>{total}</div>
        </div>
        <div className="chart-legend">
          {slices.map((s) => (
            <span key={s.name}>
              <i className="dot" style={{ background: s.color }} />
              {s.name} <strong>{s.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function AppointmentLoadChart({ appointments, horizonDays }: { appointments: Appointment[]; horizonDays: number }) {
  const palette = useChartPalette();
  const weekBuckets = Math.ceil(horizonDays / WEEK_DAYS);

  const buckets = useMemo(() => {
    const todayIso = today();
    const counts = new Array(weekBuckets + 1).fill(0);
    for (const a of appointments) {
      if (a.isDone) continue;
      const days = daysUntil(a.startsAt.slice(0, 10));
      if (days === null || days < 0 || days > horizonDays) continue;
      const idx = Math.min(weekBuckets, Math.floor(days / WEEK_DAYS));
      counts[idx] += 1;
    }
    return counts.map((count, i) => ({ label: bucketLabel(i, weekBuckets, todayIso), count }));
  }, [appointments, horizonDays, weekBuckets]);

  if (buckets.every((b) => b.count === 0)) return null;

  return (
    <Section title="Terminlast · nächste Wochen">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={buckets} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Bar dataKey="count" name="Termine" fill={palette.accent} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

const IMPORTANT_TIMELINE_WINDOW_DAYS = 365;
const IMPORTANT_CATEGORY_HUE: Record<string, number> = { birthday: 0, wedding: 1, anniversary: 2, other: 3 };

function importantTimelineMonthTicks(): Array<{ offset: number; label: string }> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const ticks: Array<{ offset: number; label: string }> = [];
  for (let i = 0; i <= 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    if (d <= now) continue;
    const offset = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    if (offset > IMPORTANT_TIMELINE_WINDOW_DAYS) break;
    ticks.push({ offset, label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(d) });
  }
  return ticks;
}

export type ImportantTimelineItem = { id: number; title: string; category: string; offsetDays: number; iso: string };

export function ImportantDatesTimeline({ items }: { items: ImportantTimelineItem[] }) {
  const palette = useChartPalette();
  const rows = [...items].sort((a, b) => a.offsetDays - b.offsetDays);
  if (rows.length === 0) return null;

  const ticks = importantTimelineMonthTicks();

  return (
    <Section title="Anlässe im Jahresverlauf">
      <div className="card">
        <div className="gantt">
          {rows.map((item) => {
            const left = (item.offsetDays / IMPORTANT_TIMELINE_WINDOW_DAYS) * 100;
            const width = Math.max(1.2, (1 / IMPORTANT_TIMELINE_WINDOW_DAYS) * 100);
            const color = palette.categorical[(IMPORTANT_CATEGORY_HUE[item.category] ?? 3) % palette.categorical.length];
            return (
              <div className="gantt-row" key={item.id}>
                <div className="gantt-label" title={item.title}>
                  <strong>{item.title}</strong>
                  <span>{shortDate(item.iso)}</span>
                </div>
                <div className="gantt-track">
                  <div className="gantt-bar" style={{ left: `${left}%`, width: `${width}%`, background: color }}
                       title={`${item.title} · ${shortDate(item.iso)}`} />
                </div>
              </div>
            );
          })}
          <div className="gantt-axis">
            <span />
            <div className="gantt-axis-track">
              {ticks.map((tick) => (
                <span key={tick.offset} className="gantt-axis-tick" style={{ left: `${(tick.offset / IMPORTANT_TIMELINE_WINDOW_DAYS) * 100}%` }}>
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

export function ageFromBirthDate(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

const TREE_TOP = new Set(["mutter", "vater"]);
const TREE_MIDDLE = new Set(["ich", "ehepartner", "schwester", "bruder"]);
const TREE_BOTTOM = new Set(["sohn", "tochter"]);

function TreeNode({ member }: { member: FamilyMember }) {
  const age = ageFromBirthDate(member.birthDate);
  return (
    <div className="family-tree-node" title={member.fullName}>
      <strong>{member.fullName}</strong>
      <span>{member.relation || "—"}</span>
      <span>{age !== null ? `${age} Jahre` : "—"}</span>
    </div>
  );
}

export function FamilyTree({ members }: { members: FamilyMember[] }) {
  if (members.length === 0) return null;

  const top: FamilyMember[] = [];
  const middle: FamilyMember[] = [];
  const bottom: FamilyMember[] = [];
  const other: FamilyMember[] = [];

  for (const m of members) {
    const key = (m.relation ?? "").trim().toLowerCase();
    if (TREE_TOP.has(key)) top.push(m);
    else if (TREE_MIDDLE.has(key)) middle.push(m);
    else if (TREE_BOTTOM.has(key)) bottom.push(m);
    else other.push(m);
  }

  return (
    <Section title="Familienstruktur">
      <div className="card">
        <div className="family-tree">
          {top.length > 0 && <div className="family-tree-row">{top.map((m) => <TreeNode key={m.id} member={m} />)}</div>}
          {top.length > 0 && middle.length > 0 && <div className="family-tree-connector" />}
          {middle.length > 0 && <div className="family-tree-row">{middle.map((m) => <TreeNode key={m.id} member={m} />)}</div>}
          {middle.length > 0 && bottom.length > 0 && <div className="family-tree-connector" />}
          {bottom.length > 0 && <div className="family-tree-row">{bottom.map((m) => <TreeNode key={m.id} member={m} />)}</div>}
          {other.length > 0 && <div className="family-tree-row family-tree-row-other">{other.map((m) => <TreeNode key={m.id} member={m} />)}</div>}
        </div>
      </div>
    </Section>
  );
}

export function AgeDistributionChart({ members }: { members: FamilyMember[] }) {
  const palette = useChartPalette();

  const data = useMemo(() => {
    return members
      .map((m) => ({ name: m.fullName.split(" ")[0] || m.fullName, age: ageFromBirthDate(m.birthDate) }))
      .filter((x): x is { name: string; age: number } => x.age !== null)
      .sort((a, b) => a.age - b.age);
  }, [members]);

  if (data.length === 0) return null;

  return (
    <Section title="Altersverteilung">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip formatValue={(v: number) => `${v} Jahre`} />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Bar dataKey="age" name="Alter" fill={palette.accent} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
