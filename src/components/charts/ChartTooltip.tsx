type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> };

export function ChartTooltip({ active, payload, label, formatValue }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="chart-tooltip">
      {label && <div className="tt-label">{label}</div>}
      {payload.map((entry, i) => {
        const value = typeof entry.value === "number" && formatValue ? formatValue(entry.value) : entry.value;
        return (
          <div className="tt-row" key={`${entry.name}-${i}`}>
            <span className="dot" style={{ background: entry.color ?? "var(--accent)" }} />
            <span>{entry.name}: <strong>{value}</strong></span>
          </div>
        );
      })}
    </div>
  );
}
