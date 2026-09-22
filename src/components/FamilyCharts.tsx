import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Appointment, FamilyMember } from "../api/types";
import { ChartTooltip } from "./charts/ChartTooltip";
import { useChartPalette } from "../lib/chartTheme";
import { daysUntil, shortDate, today } from "../lib/format";
import { Section } from "./Ui";

const WEEK_DAYS = 7;

function bucketLabel(index: number, bucketCount: number, bucketDays: number, todayIso: string): string {
  if (index === bucketCount) return `${bucketCount * bucketDays}+ Tage`;
  const start = new Date(`${todayIso}T00:00:00`);
  start.setDate(start.getDate() + index * bucketDays);
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

export function AppointmentLoadChart({ appointments, horizonDays, bucketDays = WEEK_DAYS, title = "Terminlast · nächste Wochen" }: {
  appointments: Appointment[]; horizonDays: number; bucketDays?: number; title?: string;
}) {
  const palette = useChartPalette();
  const bucketCount = Math.ceil(horizonDays / bucketDays);

  const buckets = useMemo(() => {
    const todayIso = today();
    const counts = new Array(bucketCount + 1).fill(0);
    for (const a of appointments) {
      if (a.isDone) continue;
      const days = daysUntil(a.startsAt.slice(0, 10));
      if (days === null || days < 0 || days > horizonDays) continue;
      const idx = Math.min(bucketCount, Math.floor(days / bucketDays));
      counts[idx] += 1;
    }
    return counts.map((count, i) => ({ label: bucketLabel(i, bucketCount, bucketDays, todayIso), count }));
  }, [appointments, horizonDays, bucketDays, bucketCount]);

  if (buckets.every((b) => b.count === 0)) return null;

  return (
    <Section title={title}>
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

// The structural vocabulary for RelationType: what a member is *of* the member at
// RelatedToFamilyMemberId. Generation is computed relative to that anchor, so e.g. a father-in-law
// is RelationType="parent" of RelatedTo=<your spouse> - no separate "in-law" types needed.
export const RELATION_TYPE_OPTIONS = [
  { value: "", label: "— keine Verknüpfung —" },
  { value: "parent", label: "Elternteil" },
  { value: "grandparent", label: "Großelternteil" },
  { value: "child", label: "Kind" },
  { value: "grandchild", label: "Enkelkind" },
  { value: "sibling", label: "Geschwister" },
  { value: "spouse", label: "Partner/Ehepartner" },
  { value: "aunt-uncle", label: "Onkel/Tante" },
  { value: "niece-nephew", label: "Nichte/Neffe" },
  { value: "cousin", label: "Cousin/Cousine" },
  { value: "other", label: "Sonstige (gleiche Ebene)" },
];

const RELATION_TYPE_DELTA: Record<string, number> = {
  parent: -1, grandparent: -2, child: 1, grandchild: 2, sibling: 0,
  spouse: 0, "aunt-uncle": -1, "niece-nephew": 1, cousin: 0, other: 0,
};

// Backward-compat: members created before the RelatedTo/RelationType link existed only have a
// free-text Relation label. Recognize the common ones so existing data still groups sensibly
// until it's re-linked - anything unrecognized (a brand new custom relation label, "Oma" was never
// in the old 3-tier set either) just falls back to the same generation as "Ich".
const LEGACY_RELATION_GENERATION: Array<{ match: RegExp; generation: number }> = [
  { match: /^(oma|opa|großmutter|grossmutter|großvater|grossvater)/, generation: -2 },
  { match: /^(mutter|vater|schwiegermutter|schwiegervater)/, generation: -1 },
  { match: /^(ich|ehepartner|partner|bruder|schwester)/, generation: 0 },
  { match: /^(sohn|tochter|schwiegersohn|schwiegertochter)/, generation: 1 },
  { match: /^enkel/, generation: 2 },
];

function legacyGeneration(relation?: string | null): number | null {
  const key = (relation ?? "").trim().toLowerCase();
  if (!key) return null;
  return LEGACY_RELATION_GENERATION.find((r) => r.match.test(key))?.generation ?? null;
}

// gen(x) = gen(RelatedTo(x)) + delta(RelationType(x)), root/unlinked = 0 - so depth (in-laws,
// grandchildren via a sibling, ...) is unlimited without new code per tier.
function computeGenerations(members: FamilyMember[]): Map<number, number> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const resolved = new Map<number, number>();

  function resolve(id: number, seen: Set<number>): number {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // cyclic link guard

    const member = byId.get(id);
    if (!member) return 0;
    seen.add(id);

    let generation: number;
    if (member.relatedToFamilyMemberId != null && byId.has(member.relatedToFamilyMemberId)) {
      const delta = RELATION_TYPE_DELTA[member.relationType ?? ""] ?? 0;
      generation = resolve(member.relatedToFamilyMemberId, seen) + delta;
    } else {
      generation = legacyGeneration(member.relation) ?? 0;
    }

    resolved.set(id, generation);
    return generation;
  }

  for (const m of members) resolve(m.id, new Set());
  return resolved;
}

const GENERATION_LABELS: Record<number, string> = {
  [-2]: "Großeltern",
  [-1]: "Eltern & Schwiegereltern",
  [0]: "Meine Generation",
  [1]: "Kinder & Schwiegerkinder",
  [2]: "Enkelkinder",
};

function generationLabel(generation: number): string {
  return GENERATION_LABELS[generation] ?? `Generation ${generation > 0 ? "+" : ""}${generation}`;
}

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

  const generations = computeGenerations(members);
  const groups = new Map<number, FamilyMember[]>();
  for (const m of members) {
    const gen = generations.get(m.id) ?? 0;
    const list = groups.get(gen) ?? [];
    list.push(m);
    groups.set(gen, list);
  }
  const sortedGenerations = Array.from(groups.keys()).sort((a, b) => a - b);

  return (
    <Section title="Familienstruktur">
      <div className="card">
        <div className="family-tree">
          {sortedGenerations.map((gen) => (
            <div className="family-tree-group" key={gen}>
              <div className="family-tree-group-title">{generationLabel(gen)}</div>
              <div className="family-tree-row">
                {groups.get(gen)!.map((m) => <TreeNode key={m.id} member={m} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function AgeDistributionChart({ members }: { members: FamilyMember[] }) {
  const palette = useChartPalette();

  const data = useMemo(() => {
    return members
      .map((m) => ({ name: m.fullName, age: ageFromBirthDate(m.birthDate) }))
      .filter((x): x is { name: string; age: number } => x.age !== null)
      .sort((a, b) => a.age - b.age);
  }, [members]);

  if (data.length === 0) return null;

  return (
    <Section title="Altersverteilung">
      <div className="card">
        <div className="chart-box chart-box-tall">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 48 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: palette.textSoft }} axisLine={{ stroke: palette.line }}
                     tickLine={false} interval={0} angle={-35} textAnchor="end" height={60} />
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
