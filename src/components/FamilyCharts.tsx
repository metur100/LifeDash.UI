import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Appointment, FamilyMember } from "../api/types";
import { ChartTooltip } from "./charts/ChartTooltip";
import { useChartPalette } from "../lib/chartTheme";
import { daysUntil, today } from "../lib/format";
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
// RelatedToFamilyMemberId. E.g. a father-in-law is RelationType="parent" of
// RelatedTo=<your spouse> - no separate "in-law" types needed, since the tree is built by walking
// these edges outward from whoever is marked IsSelf, not by a fixed relation vocabulary per tier.
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

const RELATION_TYPE_LABEL = new Map(RELATION_TYPE_OPTIONS.map((o) => [o.value, o.label]));

// Every edge normalizes into exactly one of these three buckets, regardless of which of the two
// linked members' records actually stores it (a "parent" edge on the parent's own record and a
// "child" edge on the child's record describe the same relationship from opposite ends):
//   - a "descend" pair (ancestorId, descendantId) - the descendant nests under the ancestor
//   - a spouse pair - shown paired inline, never nested
//   - a "lateral" pair - side by side, each gets its own branch when reached from the other
function classifyEdges(members: FamilyMember[], byId: Map<number, FamilyMember>) {
  const childrenOf = new Map<number, number[]>();
  const parentOf = new Map<number, number[]>();
  const spouseOf = new Map<number, number>();
  const lateralOf = new Map<number, number[]>();

  const addChild = (ancestorId: number, descendantId: number) => {
    childrenOf.set(ancestorId, [...(childrenOf.get(ancestorId) ?? []), descendantId]);
    parentOf.set(descendantId, [...(parentOf.get(descendantId) ?? []), ancestorId]);
  };
  const addLateral = (a: number, b: number) => {
    lateralOf.set(a, [...(lateralOf.get(a) ?? []), b]);
    lateralOf.set(b, [...(lateralOf.get(b) ?? []), a]);
  };

  for (const m of members) {
    const r = m.relatedToFamilyMemberId;
    if (r == null || !byId.has(r) || r === m.id) continue;

    switch (m.relationType) {
      case "parent": case "grandparent": addChild(m.id, r); break; // m is the ancestor, r descends
      case "child": case "grandchild": addChild(r, m.id); break; // r is the ancestor, m descends
      case "spouse": spouseOf.set(m.id, r); spouseOf.set(r, m.id); break;
      default: addLateral(m.id, r); break; // sibling, aunt-uncle, niece-nephew, cousin, other
    }
  }

  return { childrenOf, parentOf, spouseOf, lateralOf };
}

// Describes a member relative to whoever anchors them in the tree - e.g. "Kind" when linked
// straight to the root, or "Kind (von Sestra)" when linked via someone else, so a nephew doesn't
// read the same as your own child.
export function describeRelation(member: FamilyMember, byId: Map<number, FamilyMember>, rootId: number | null): string {
  if (member.id === rootId) return "Ich";
  if (!member.relatedToFamilyMemberId || !member.relationType) return member.relation || "—";

  const anchor = byId.get(member.relatedToFamilyMemberId);
  const typeLabel = RELATION_TYPE_LABEL.get(member.relationType) ?? member.relationType;
  if (!anchor || anchor.id === rootId) return typeLabel;
  return `${typeLabel} (von ${anchor.fullName})`;
}

// Picks the tree's root: the member marked IsSelf, or - until one is set - the most-connected
// member, so the tree still renders something coherent rather than a flat unconnected list.
export function pickRootId(members: FamilyMember[]): number | null {
  const marked = members.find((m) => m.isSelf);
  if (marked) return marked.id;
  if (members.length === 0) return null;

  const degree = new Map<number, number>();
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const m of members) {
    if (m.relatedToFamilyMemberId != null) { bump(m.id); bump(m.relatedToFamilyMemberId); }
  }
  return members.reduce((best, m) => (degree.get(m.id) ?? 0) > (degree.get(best.id) ?? 0) ? m : best, members[0]).id;
}

type FamilyBranch = { member: FamilyMember; companion?: FamilyMember; children: FamilyBranch[] };

// Builds the forest of top-level branches rooted at rootId: each branch is one person (+ spouse,
// paired inline) with their descendants nested inside. Ancestors, siblings and other lateral
// relations become their *own* top-level branches instead of nesting the root under them, since
// the root is always the tree's fixed starting point, not necessarily its genealogical top.
function buildFamilyBranches(members: FamilyMember[], byId: Map<number, FamilyMember>, rootId: number): FamilyBranch[] {
  const { childrenOf, parentOf, spouseOf, lateralOf } = classifyEdges(members, byId);
  const visited = new Set<number>();

  function buildNode(id: number): FamilyBranch {
    visited.add(id);
    const member = byId.get(id)!;

    const companionId = spouseOf.get(id);
    const companion = companionId != null && !visited.has(companionId) ? byId.get(companionId) : undefined;
    if (companion) visited.add(companion.id);

    const kidIds = new Set<number>([
      ...(childrenOf.get(id) ?? []),
      ...(companionId != null ? childrenOf.get(companionId) ?? [] : []),
    ]);
    const children = Array.from(kidIds).filter((k) => !visited.has(k)).map((k) => buildNode(k));

    return { member, companion, children };
  }

  const branches: FamilyBranch[] = [];
  const queue: number[] = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;

    const node = buildNode(id);
    branches.push(node);

    const anchors = [node.member.id, node.companion?.id].filter((x): x is number => x != null);
    for (const a of anchors) {
      for (const nb of lateralOf.get(a) ?? []) if (!visited.has(nb)) queue.push(nb);
      for (const anc of parentOf.get(a) ?? []) if (!visited.has(anc)) queue.push(anc);
    }

    // Nothing left in the queue but unrelated members remain (no path back to root) - start a new,
    // disconnected branch for one of them rather than silently dropping them from the tree.
    if (queue.length === 0) {
      const stray = members.find((m) => !visited.has(m.id));
      if (stray) queue.push(stray.id);
    }
  }

  return branches;
}

function BranchNode({ node, rootId, byId }: { node: FamilyBranch; rootId: number | null; byId: Map<number, FamilyMember> }) {
  const age = ageFromBirthDate(node.member.birthDate);
  const companionAge = node.companion ? ageFromBirthDate(node.companion.birthDate) : null;

  return (
    <div className="family-branch">
      <div className="family-tree-node" title={node.companion ? `${node.member.fullName} & ${node.companion.fullName}` : node.member.fullName}>
        <strong>{node.member.fullName}{node.companion ? ` & ${node.companion.fullName}` : ""}</strong>
        <span>{describeRelation(node.member, byId, rootId)}{age !== null ? ` · ${age} Jahre` : ""}</span>
        {node.companion && (
          <span>{describeRelation(node.companion, byId, rootId)}{companionAge !== null ? ` · ${companionAge} Jahre` : ""}</span>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="family-branch-children">
          {node.children.map((child) => <BranchNode key={child.member.id} node={child} rootId={rootId} byId={byId} />)}
        </div>
      )}
    </div>
  );
}

export function FamilyTree({ members }: { members: FamilyMember[] }) {
  if (members.length === 0) return null;

  const byId = new Map(members.map((m) => [m.id, m]));
  const hasExplicitRoot = members.some((m) => m.isSelf);
  const rootId = pickRootId(members);
  const branches = rootId != null ? buildFamilyBranches(members, byId, rootId) : [];

  return (
    <Section title="Familienstruktur">
      <div className="card">
        {!hasExplicitRoot && (
          <p className="lede" style={{ marginTop: -4, marginBottom: 10 }}>
            Lege in der Personenliste fest, wer "Ich" ist (Stern-Symbol), damit der Stammbaum von der richtigen Stelle aus aufgebaut wird.
          </p>
        )}
        <div className="family-tree">
          {branches.map((branch) => <BranchNode key={branch.member.id} node={branch} rootId={rootId} byId={byId} />)}
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
