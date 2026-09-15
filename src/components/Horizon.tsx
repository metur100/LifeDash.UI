import { useNavigate } from "react-router-dom";
import type { Alert } from "../api/types";
import { countdown } from "../lib/format";

/**
 * The signature element: every deadline in the next N days plotted on one
 * timeline. Pins are positioned on a sqrt scale so the next two weeks get
 * room to breathe while distant items still stay visible.
 */
function scaleLabels(horizon: number): string[] {
  if (horizon <= 14) return ["heute", `${Math.round(horizon / 2)} Tage`, `${horizon} Tage`];
  if (horizon <= 30) return ["heute", "1 Woche", "2 Wochen", "3 Wochen", `${horizon} Tage`];
  if (horizon <= 60) return ["heute", "1 Woche", "2 Wochen", "1 Monat", `${horizon} Tage`];
  return ["heute", "1 Woche", "1 Monat", "2 Monate", `${horizon} Tage`];
}

export default function Horizon({ alerts, horizon = 30 }:
  { alerts: Alert[]; horizon?: number }) {
  const navigate = useNavigate();

  const dated = alerts.filter((a) => a.daysLeft !== null && a.daysLeft <= horizon);
  const pos = (d: number) => {
    const clamped = Math.max(-14, Math.min(d, horizon));
    if (clamped < 0) return (1 - Math.sqrt(Math.abs(clamped) / 14)) * 8;
    return 8 + Math.sqrt(clamped / horizon) * 90;
  };

  return (
    <div className="horizon">
      <div className="horizon-head">
        <span className="horizon-title">Fristen-Horizont · nächste {horizon} Tage</span>
        <div className="horizon-legend" aria-hidden>
          <span title="Termin oder Frist liegt bereits in der Vergangenheit — sofort erledigen."><i className="dot" style={{ background: "var(--danger)" }} />überfällig</span>
          <span title="Fällig in den nächsten 7 Tagen."><i className="dot" style={{ background: "var(--warning)" }} />dringend</span>
          <span title="Fällig innerhalb der Erinnerungsfrist des Eintrags (mindestens 14 Tage)."><i className="dot" style={{ background: "var(--accent)" }} />bald</span>
          <span title="Liegt weiter in der Zukunft, aber noch im Anzeigezeitraum."><i className="dot" style={{ background: "var(--text-soft)" }} />Hinweis</span>
        </div>
      </div>

      <div className="track">
        <div className="track-line" />
        <div className="track-today" style={{ left: "8%" }} />
        {dated.map((a) => (
          <button
            key={a.id}
            className={`pin pin-${a.severity}`}
            style={{ left: `${pos(a.daysLeft!)}%` }}
            title={`${a.title} — ${countdown(a.daysLeft)}`}
            aria-label={`${a.title}, ${countdown(a.daysLeft)}`}
            onClick={() => a.actionPath && navigate(a.actionPath)}
          >
            <i /><b />
          </button>
        ))}
      </div>

      <div className="track-scale" aria-hidden>
        {scaleLabels(horizon).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
