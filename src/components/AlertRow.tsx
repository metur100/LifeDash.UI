import { Link } from "react-router-dom";
import type { Alert } from "../api/types";
import { countdown } from "../lib/format";

const moduleLabel: Record<string, string> = {
  family: "Familie", authority: "Behörden", finance: "Finanzen",
  home: "Allgemein", travel: "Reisen", general: "Allgemein",
};

export default function AlertRow({ alert }: { alert: Alert }) {
  const d = alert.daysLeft;
  const big = d === null ? "—" : d < 0 ? `+${Math.abs(d)}` : `${d}`;
  const unit = d === null ? "offen" : d < 0 ? "Tage über" : d === 1 ? "Tag" : "Tage";

  return (
    <article className={`alert sev-${alert.severity}`}>
      <div className="alert-count" aria-hidden>
        {big}<small>{unit}</small>
      </div>
      <div>
        <div className="alert-title">
          <span className="alert-tag">{moduleLabel[alert.module] ?? alert.module}</span>
          {alert.title}
        </div>
        <div className="alert-msg">{alert.message}</div>
      </div>
      {alert.actionPath && (
        <Link className="btn ghost small" to={alert.actionPath}>
          {alert.actionLabel ?? "Öffnen"}
        </Link>
      )}
      <span className="sr-only">{countdown(d)}</span>
    </article>
  );
}
