import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { TaskItem } from "../api/types";
import { useChartPalette } from "../lib/chartTheme";
import { Section } from "./Ui";

const moduleLabels: Record<string, string> = {
  general: "Allgemein", family: "Familie", authority: "Behörden",
  finance: "Finanzen", home: "Zuhause", travel: "Reisen",
};

export default function TaskCompletionDonuts({ tasks }: { tasks: TaskItem[] }) {
  const palette = useChartPalette();

  const groups = useMemo(() => {
    const byModule = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      const g = byModule.get(t.module) ?? { done: 0, total: 0 };
      g.total += 1;
      if (t.isDone) g.done += 1;
      byModule.set(t.module, g);
    }
    return [...byModule.entries()]
      .map(([module, g]) => ({ module, label: moduleLabels[module] ?? module, ...g }))
      .sort((a, b) => b.total - a.total);
  }, [tasks]);

  if (groups.length === 0) return null;

  return (
    <Section title="Erledigungsquote nach Bereich">
      <div className="card">
        <div className="donut-grid">
          {groups.map((g) => {
            const pct = Math.round((g.done / g.total) * 100);
            const data = [
              { name: "Erledigt", value: g.done, color: palette.ok },
              { name: "Offen", value: g.total - g.done, color: palette.line },
            ].filter((d) => d.value > 0);
            return (
              <div className="donut-cell" key={g.module}>
                <div className="chart-box small" style={{ position: "relative" }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data} dataKey="value" innerRadius="68%" outerRadius="100%"
                           startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                        {data.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-pct" style={{ fontSize: 15 }}>{pct}%</div>
                </div>
                <div className="donut-cell-label">{g.label}</div>
                <div className="donut-cell-note">{g.done}/{g.total} erledigt</div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
