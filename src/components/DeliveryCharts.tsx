import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CarrierType, PackageItem, PackageStatus } from "../pages/Deliveries";
import { ChartTooltip } from "./charts/ChartTooltip";
import { useChartPalette } from "../lib/chartTheme";
import type { ChartPalette } from "../lib/chartTheme";
import { Section } from "./Ui";

const STATUS_LABEL: Record<PackageStatus, string> = {
  exception: "Verzögerung",
  out_for_delivery: "In Zustellung",
  in_transit: "Unterwegs",
  announced: "Angekündigt",
  delivered: "Zugestellt",
};

const STATUS_ORDER: PackageStatus[] = ["exception", "out_for_delivery", "in_transit", "announced", "delivered"];

function statusColor(palette: ChartPalette, status: PackageStatus): string {
  if (status === "delivered") return palette.ok;
  if (status === "exception") return palette.danger;
  if (status === "out_for_delivery") return palette.warning;
  if (status === "announced") return palette.accent;
  return palette.textSoft; // in_transit
}

export function PackageStatusDonut({ packages }: { packages: PackageItem[] }) {
  const palette = useChartPalette();

  const slices = useMemo(() => {
    const counts = new Map<PackageStatus, number>();
    for (const p of packages) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return STATUS_ORDER
      .map((status) => ({ status, name: STATUS_LABEL[status], value: counts.get(status) ?? 0, color: statusColor(palette, status) }))
      .filter((s) => s.value > 0);
  }, [packages, palette]);

  const total = packages.length;
  if (total === 0) return null;

  return (
    <Section title="Sendungen nach Status">
      <div className="card">
        <div className="chart-box" style={{ position: "relative", height: 190 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%"
                   paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.status} fill={s.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-pct" style={{ fontSize: 22 }}>{total}</div>
        </div>
        <div className="chart-legend">
          {slices.map((s) => (
            <span key={s.status}>
              <i className="dot" style={{ background: s.color }} />
              {s.name} <strong>{s.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

const CARRIER_LABEL: Record<CarrierType, string> = {
  dhl: "DHL",
  dpd: "DPD",
  hermes: "Hermes",
  gls: "GLS",
  other: "Andere",
};

const CARRIER_ORDER: CarrierType[] = ["dhl", "dpd", "hermes", "gls", "other"];

export function PackagesByCarrierChart({ packages }: { packages: PackageItem[] }) {
  const palette = useChartPalette();

  const data = useMemo(() => {
    const counts = new Map<CarrierType, number>();
    for (const p of packages) counts.set(p.carrier, (counts.get(p.carrier) ?? 0) + 1);
    return CARRIER_ORDER
      .map((carrier, i) => ({ carrier, label: CARRIER_LABEL[carrier], count: counts.get(carrier) ?? 0, color: palette.categorical[i % palette.categorical.length] }))
      .filter((c) => c.count > 0);
  }, [packages, palette]);

  if (data.length === 0) return null;

  return (
    <Section title="Sendungen nach Paketdienst">
      <div className="card">
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={{ stroke: palette.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.textSoft }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: palette.line, opacity: 0.4 }} />
              <Bar dataKey="count" name="Sendungen" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.carrier} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Section>
  );
}
