import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./charts/ChartTooltip";
import { euro } from "../lib/format";
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

// Monat and Jahr totals differ by roughly 12x, so stacking both on one absolute
// euro axis leaves the Monat bar unreadably thin. What's actually useful here
// is the *composition* (how much of each period is recurring vs one-off), so
// each row is normalized to 100% and the real euro amounts move to labels/tooltip.
function CadenceTooltip({ active, payload, label }: {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload: { recurringAmt: number; oneTimeAmt: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const { recurringAmt, oneTimeAmt } = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{label}</div>
      <div className="tt-row"><span>Wiederkehrend: <strong>{euro(recurringAmt)}</strong></span></div>
      <div className="tt-row"><span>Einmalig: <strong>{euro(oneTimeAmt)}</strong></span></div>
    </div>
  );
}

export function CadenceStackedChart({ monthRecurring, monthOneTime, yearRecurring, yearOneTime }: {
  monthRecurring: number; monthOneTime: number; yearRecurring: number; yearOneTime: number;
}) {
  const palette = useChartPalette();

  const rows = [
    { period: "Monat", recurringAmt: monthRecurring, oneTimeAmt: monthOneTime },
    { period: "Jahr", recurringAmt: yearRecurring, oneTimeAmt: yearOneTime },
  ];
  const data = rows.map((r) => {
    const total = r.recurringAmt + r.oneTimeAmt;
    return {
      ...r,
      recurringPct: total > 0 ? (r.recurringAmt / total) * 100 : 0,
      oneTimePct: total > 0 ? (r.oneTimeAmt / total) * 100 : 0,
    };
  });

  if (data.every((d) => d.recurringAmt + d.oneTimeAmt <= 0)) return null;

  return (
    <Section title="Kosten nach Turnus">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`}
                     tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="period" tick={{ fontSize: 12, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} width={48} />
              <Tooltip content={<CadenceTooltip />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: palette.textSoft }} />
              <Bar dataKey="recurringPct" name="Wiederkehrend" stackId="c" fill={palette.accent} maxBarSize={34} isAnimationActive={false} />
              <Bar dataKey="oneTimePct" name="Einmalig" stackId="c" fill={palette.categorical[0]} radius={[0, 4, 4, 0]} maxBarSize={34} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
