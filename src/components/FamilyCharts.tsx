import { useLayoutEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
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

// Each stored edge "m is <type> of r" is walkable from both ends: from r it reads <type>, from m
// it reads the inverse. Symmetric types (sibling, spouse, cousin, other) are their own inverse.
const INVERSE_RELATION: Record<string, string> = {
  parent: "child", child: "parent",
  grandparent: "grandchild", grandchild: "grandparent",
  "aunt-uncle": "niece-nephew", "niece-nephew": "aunt-uncle",
};

// Generations up (+) or down (-) one step moves; anything not listed stays on the same level.
const GENERATION_STEP: Record<string, number> = {
  parent: 1, grandparent: 2, "aunt-uncle": 1,
  child: -1, grandchild: -2, "niece-nephew": -1,
};

// Relation to me when someone is <step> of a person who is <via> to me - e.g. the parent of my
// spouse is my parent-in-law. Combinations not listed fall back to "<step> von <name>".
const COMPOSED_RELATION: Record<string, Record<string, string>> = {
  spouse: { parent: "parent-in-law", sibling: "sibling-in-law", child: "child" },
  parent: { parent: "grandparent", sibling: "aunt-uncle", child: "sibling", spouse: "parent" },
  child: { child: "grandchild", spouse: "child-in-law", sibling: "child" },
  sibling: { child: "niece-nephew", spouse: "sibling-in-law", parent: "parent", sibling: "sibling" },
  "aunt-uncle": { child: "cousin", spouse: "aunt-uncle" },
  "parent-in-law": { child: "sibling-in-law", spouse: "parent-in-law" },
  grandchild: { sibling: "grandchild" },
};

const TO_ME_LABEL = new Map<string, string>([
  ...RELATION_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label] as [string, string]),
  ["parent-in-law", "Schwiegerelternteil"],
  ["sibling-in-law", "Schwager/Schwägerin"],
  ["child-in-law", "Schwiegerkind"],
]);

// Order in which a person's relatives are claimed while walking outward, so e.g. a child linked to
// both me and my spouse hangs under me rather than under the spouse.
const STEP_PRIORITY = ["spouse", "parent", "child", "sibling", "grandparent", "grandchild", "aunt-uncle", "niece-nephew", "cousin", "other"];

type RelationNode = {
  member: FamilyMember;
  parentId: number | null;   // who this person was reached from (tree edge), null for the root
  step: string | null;       // what this person is of parentId
  key: string | null;        // relation to the root when known, e.g. "parent-in-law"
  label: string;             // human relation to the root
  generation: number;        // 0 = root's level, + above, - below
};

// Walks the relation graph outward from the root (breadth-first), so everyone's relation is
// described from the root's point of view along the shortest path. Members with no path to the
// root are returned separately.
function buildRelationTree(members: FamilyMember[], rootId: number | null) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const adj = new Map<number, Array<{ to: number; step: string }>>();
  const link = (from: number, to: number, step: string) => adj.set(from, [...(adj.get(from) ?? []), { to, step }]);

  for (const m of members) {
    const r = m.relatedToFamilyMemberId;
    if (r == null || !byId.has(r) || r === m.id || !m.relationType) continue;
    const type = TO_ME_LABEL.has(m.relationType) ? m.relationType : "other";
    link(r, m.id, type);
    link(m.id, r, INVERSE_RELATION[type] ?? type);
  }

  const nodes = new Map<number, RelationNode>();
  const order: number[] = [];
  if (rootId == null || !byId.has(rootId)) return { nodes, order, unlinked: members };

  nodes.set(rootId, { member: byId.get(rootId)!, parentId: null, step: null, key: "self", label: "Ich", generation: 0 });
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const from = nodes.get(id)!;
    const edges = [...(adj.get(id) ?? [])]
      .sort((a, b) => STEP_PRIORITY.indexOf(a.step) - STEP_PRIORITY.indexOf(b.step));
    for (const { to, step } of edges) {
      if (nodes.has(to)) continue;
      const key = from.key === "self" ? step : (from.key && COMPOSED_RELATION[from.key]?.[step]) || null;
      const stepLabel = TO_ME_LABEL.get(step) ?? step;
      nodes.set(to, {
        member: byId.get(to)!,
        parentId: id,
        step,
        key,
        label: key ? TO_ME_LABEL.get(key) ?? key : `${stepLabel} von ${from.member.fullName}`,
        generation: from.generation + (GENERATION_STEP[step] ?? 0),
      });
      queue.push(to);
    }
  }

  return { nodes, order, unlinked: members.filter((m) => !nodes.has(m.id)) };
}

// Describes a member relative to the tree's root ("Ich") - e.g. "Schwiegerelternteil" for the
// parent of your spouse, or "Kind von Sestra" where no single word fits.
export function describeRelation(member: FamilyMember, byId: Map<number, FamilyMember>, rootId: number | null): string {
  if (member.id === rootId) return "Ich";
  const node = buildRelationTree(Array.from(byId.values()), rootId).nodes.get(member.id);
  if (node) return node.label;
  if (member.relatedToFamilyMemberId && member.relationType) {
    const anchor = byId.get(member.relatedToFamilyMemberId);
    const typeLabel = RELATION_TYPE_LABEL.get(member.relationType) ?? member.relationType;
    return anchor ? `${typeLabel} von ${anchor.fullName}` : typeLabel;
  }
  return member.relation || "—";
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

const NODE_W = 156;
const NODE_H = 58;
const SLOT_W = NODE_W + 20;
const ROW_H = NODE_H + 46;
const PAD = 16;

type PlacedNode = RelationNode & { x: number; y: number };

// Lays the tree out around the root: one row per generation (ancestors above, descendants below),
// spouse to the root's right, siblings and other same-level relatives to the left. Everyone else
// is placed near whoever they were reached from, and each row is then pushed apart so no two
// boxes overlap.
function layoutRelationTree(nodes: Map<number, RelationNode>, order: number[]) {
  const pref = new Map<number, number>();
  const rootId = order[0];
  pref.set(rootId, 0);

  for (const id of order) {
    const node = nodes.get(id)!;
    const kids = order.filter((k) => nodes.get(k)!.parentId === id);
    // A couple away from the root (e.g. my parents) is centred as a pair on the spot the first
    // partner was given, rather than the partner being pushed out beside whoever sits next door.
    if (id !== rootId && kids.some((k) => nodes.get(k)!.step === "spouse")) pref.set(id, pref.get(id)! - SLOT_W / 2);
    const px = pref.get(id)!;

    const up = kids.filter((k) => nodes.get(k)!.generation > node.generation);
    const down = kids.filter((k) => nodes.get(k)!.generation < node.generation);
    for (const group of [up, down]) {
      group.forEach((k, i) => pref.set(k, px + (i - (group.length - 1) / 2) * SLOT_W));
    }

    const level = kids.filter((k) => nodes.get(k)!.generation === node.generation);
    let right = 0;
    let left = 0;
    for (const k of level) {
      // At the root the spouse goes right and everyone else left; further out, keep moving away
      // from the root so branches don't fold back over the middle.
      const isSpouse = nodes.get(k)!.step === "spouse";
      const goRight = id === rootId ? isSpouse : isSpouse ? right === 0 : px + SLOT_W / 2 > 0;
      pref.set(k, goRight ? px + (++right) * SLOT_W : px - (++left) * SLOT_W);
    }
  }

  const rows = new Map<number, number[]>();
  for (const id of order) {
    const g = nodes.get(id)!.generation;
    rows.set(g, [...(rows.get(g) ?? []), id]);
  }

  const x = new Map<number, number>();
  for (const [generation, ids] of rows) {
    const sorted = [...ids].sort((a, b) => pref.get(a)! - pref.get(b)!);
    const placed: number[] = [];
    sorted.forEach((id, i) => placed.push(i === 0 ? pref.get(id)! : Math.max(pref.get(id)!, placed[i - 1] + SLOT_W)));
    // Re-centre the row: the root's row keeps the root fixed at 0, other rows stay as close to
    // their preferred spots as the push-apart allows.
    const shift = generation === 0
      ? -placed[sorted.indexOf(rootId)]
      : sorted.reduce((sum, id, i) => sum + pref.get(id)! - placed[i], 0) / sorted.length;
    sorted.forEach((id, i) => x.set(id, Math.round(placed[i] + shift)));
  }

  const xs = Array.from(x.values());
  const gens = Array.from(rows.keys());
  const minX = Math.min(...xs);
  const maxGen = Math.max(...gens);
  const placedNodes: PlacedNode[] = order.map((id) => ({
    ...nodes.get(id)!,
    x: x.get(id)! - minX + PAD,
    y: (maxGen - nodes.get(id)!.generation) * ROW_H + PAD,
  }));

  return {
    placed: placedNodes,
    width: Math.max(...xs) - minX + NODE_W + PAD * 2,
    height: (maxGen - Math.min(...gens)) * ROW_H + NODE_H + PAD * 2,
  };
}

function edgePath(from: PlacedNode, to: PlacedNode): string {
  const fx = from.x + NODE_W / 2;
  const tx = to.x + NODE_W / 2;
  if (to.generation === from.generation) {
    // Same level: arch over the top, so a link skipping a neighbour doesn't run through it.
    const y = from.y;
    const lift = Math.min(34, 14 + Math.abs(tx - fx) / 12);
    return `M ${fx} ${y} C ${fx} ${y - lift}, ${tx} ${y - lift}, ${tx} ${y}`;
  }
  const goingUp = to.generation > from.generation;
  const y1 = goingUp ? from.y : from.y + NODE_H;
  const y2 = goingUp ? to.y + NODE_H : to.y;
  const mid = (y1 + y2) / 2;
  return `M ${fx} ${y1} C ${fx} ${mid}, ${tx} ${mid}, ${tx} ${y2}`;
}

export function FamilyTree({ members, onSelect }: { members: FamilyMember[]; onSelect?: (m: FamilyMember) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootId = pickRootId(members);
  const hasExplicitRoot = members.some((m) => m.isSelf);

  const { layout, unlinked } = useMemo(() => {
    const tree = buildRelationTree(members, rootId);
    return { layout: tree.order.length > 0 ? layoutRelationTree(tree.nodes, tree.order) : null, unlinked: tree.unlinked };
  }, [members, rootId]);

  // Start with "Ich" in view when the tree is wider than the card (typical on phones).
  const rootLeft = layout?.placed[0]?.x ?? 0;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = rootLeft + NODE_W / 2 - el.clientWidth / 2;
  }, [rootLeft, layout?.width]);

  if (members.length === 0 || !layout) return null;
  const byId = new Map(layout.placed.map((n) => [n.member.id, n]));

  const nodeButton = (m: FamilyMember, label: string, isRoot = false, style?: CSSProperties) => {
    const age = ageFromBirthDate(m.birthDate);
    return (
      <button key={m.id} type="button" className={`family-tree-node ${isRoot ? "is-root" : ""}`} style={style}
        title={`${m.fullName} — ${label}`} onClick={() => onSelect?.(m)} disabled={!onSelect}>
        <strong>{m.fullName}</strong>
        <span>{label}{age !== null ? ` · ${age} Jahre` : ""}</span>
      </button>
    );
  };

  return (
    <Section title="Familienstruktur">
      <div className="card">
        {!hasExplicitRoot && (
          <p className="lede" style={{ marginTop: -4, marginBottom: 10 }}>
            Lege in der Personenliste fest, wer "Ich" ist (Stern-Symbol), damit der Stammbaum von der richtigen Stelle aus aufgebaut wird.
          </p>
        )}
        <div className="family-tree-scroll" ref={scrollRef}>
          <div className="family-tree-canvas" style={{ width: layout.width, height: layout.height }}>
            <svg className="family-tree-edges" width={layout.width} height={layout.height} aria-hidden>
              {layout.placed.filter((n) => n.parentId != null).map((n) => (
                <path key={n.member.id} d={edgePath(byId.get(n.parentId!)!, n)}
                  className={n.step === "spouse" ? "spouse" : undefined} />
              ))}
            </svg>
            {layout.placed.map((n) => nodeButton(n.member, n.label, n.parentId == null,
              { left: n.x, top: n.y, width: NODE_W, height: NODE_H }))}
          </div>
        </div>
        {unlinked.length > 0 && (
          <div className="family-tree-unlinked">
            <span className="family-tree-unlinked-label">Nicht mit dir verknüpft</span>
            <div className="family-tree-unlinked-list">
              {unlinked.map((m) => nodeButton(m, describeRelation(m, new Map(members.map((x) => [x.id, x])), rootId)))}
            </div>
          </div>
        )}
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
