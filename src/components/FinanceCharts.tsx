import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./charts/ChartTooltip";
import { euro, monthLabel } from "../lib/format";
import { useChartPalette } from "../lib/chartTheme";
import { Section } from "./Ui";

export function IncomeCostChart({ monthIncome, monthCosts, yearIncome, yearCosts }: {
  monthIncome: number; monthCosts: number; yearIncome: number; yearCosts: number;
}) {
  const palette = useChartPalette();
  const data = [
    { period: "Monat", Einnahmen: monthIncome, Kosten: monthCosts },
    { period: "Jahr", Einnahmen: yearIncome, Kosten: yearCosts },
  ];

  return (
    <Section title="Einnahmen vs. Kosten">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 12, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false}
                     tickFormatter={(v: number) => euro(v).replace(",00", "")} width={70} />
              <Tooltip content={<ChartTooltip formatValue={euro} />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: palette.textSoft }} />
              <Bar dataKey="Einnahmen" fill={palette.ok} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              <Bar dataKey="Kosten" fill={palette.danger} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}

export function CostBreakdownDonut({ categories }: { categories: Array<[string, number]> }) {
  const palette = useChartPalette();

  const slices = useMemo(() => {
    let hueIndex = 0;
    return categories.map(([name, amount]) => {
      const color = name === "Andere" ? palette.textSoft : palette.categorical[hueIndex++ % palette.categorical.length];
      return { name, value: amount, color };
    });
  }, [categories, palette]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (slices.length === 0) return null;

  return (
    <Section title="Kostenverteilung / Monat">
      <div className="card">
        <div className="chart-box" style={{ position: "relative" }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%"
                   paddingAngle={2} stroke="none" isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip formatValue={euro} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-pct" style={{ fontSize: 15 }}>{euro(total).replace(",00", "")}</div>
        </div>
        <div className="chart-legend">
          {slices.map((s) => (
            <span key={s.name}>
              <i className="dot" style={{ background: s.color }} />
              {s.name} <strong>{euro(s.value)}</strong>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

// Last 6 calendar months of actually paid amounts, so the trend reflects what
// was really spent rather than the always-the-same recurring/one-off split
// the old "Kosten nach Turnus" chart showed (which just compared Monat vs.
// Jahr composition and rarely told anyone anything new).
export function CostHistoryChart({ paid }: { paid: Array<{ amount: number; paidOn?: string | null; dueOn: string }> }) {
  const palette = useChartPalette();

  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, period: monthLabel(d.toISOString()) };
    });
    const totals = new Map(months.map((m) => [m.key, 0]));
    for (const p of paid) {
      const key = (p.paidOn ?? p.dueOn).slice(0, 7);
      if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + p.amount);
    }
    return months.map((m) => ({ period: m.period, Kosten: totals.get(m.key) ?? 0 }));
  }, [paid]);

  if (data.every((d) => d.Kosten <= 0)) return null;

  return (
    <Section title="Kostenverlauf">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 12, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false}
                     tickFormatter={(v: number) => euro(v).replace(",00", "")} width={70} />
              <Tooltip content={<ChartTooltip formatValue={euro} />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Bar dataKey="Kosten" fill={palette.accent} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
