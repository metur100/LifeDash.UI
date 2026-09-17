import { useTheme } from "../components/ThemeContext";

// Validated (node scripts/validate_palette.js) against this app's actual card
// surfaces (#ffffff light / #151d26 dark) — 8 hues, fixed order, never cycled,
// so a category keeps its color regardless of amount or filter.
const CATEGORICAL_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const CATEGORICAL_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767",
];

// Mirrors the app's own CSS custom properties (styles/app.css) — Recharts
// needs literal hex, since SVG presentation attributes don't resolve var().
const LIGHT = {
  categorical: CATEGORICAL_LIGHT,
  accent: "#b54f2f",
  danger: "#ac2b41",
  warning: "#9b6d1a",
  ok: "#1f7a5a",
  text: "#2f1f17",
  textSoft: "#766257",
  line: "#e2d3c6",
  card: "#ffffff",
};

const DARK = {
  categorical: CATEGORICAL_DARK,
  accent: "#6ea8ff",
  danger: "#ff7f91",
  warning: "#efbf72",
  ok: "#68d0a6",
  text: "#e8edf2",
  textSoft: "#a7b3bf",
  line: "#2a3744",
  card: "#151d26",
};

export type ChartPalette = typeof LIGHT;

// Same severity → color mapping already established in Horizon.tsx / app.css
// (sev-0..3): Später/Bald/Dringend/Überfällig.
export function severityColor(p: ChartPalette, severity: number): string {
  if (severity === 3) return p.danger;
  if (severity === 2) return p.warning;
  if (severity === 1) return p.accent;
  return p.textSoft;
}

export function useChartPalette(): ChartPalette {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
