import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { DashboardResponse } from "../api/types";
import AlertRow from "../components/AlertRow";
import Horizon from "../components/Horizon";
import { Empty, ErrorBar, PageHead, Stat } from "../components/Ui";
import { euro } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const filters = [
  { id: "all", label: "Alles" },
  { id: "3", label: "Überfällig" },
  { id: "2", label: "Dringend" },
  { id: "authority", label: "Behörden" },
  { id: "finance", label: "Finanzen" },
  { id: "family", label: "Familie" },
  { id: "travel", label: "Reisen" },
];

export default function Dashboard({ onCount }: { onCount?: (n: number) => void }) {
  const [filter, setFilter] = useState("all");
  const { data, error, loading } = useAsync<DashboardResponse>(
    () => api.get<DashboardResponse>("/api/dashboard?horizonDays=120"), []);

  const urgentCount = data
    ? data.summary.overdue + data.summary.urgent
    : 0;
  useEffect(() => { onCount?.(urgentCount); }, [urgentCount, onCount]);

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.alerts;
    if (filter === "3" || filter === "2")
      return data.alerts.filter((a) => String(a.severity) === filter);
    return data.alerts.filter((a) => a.module === filter);
  }, [data, filter]);

  if (loading) return <p className="lede">Wird geladen …</p>;
  if (error) return <ErrorBar message={error} />;
  if (!data) return null;

  const s = data.summary;

  return (
    <>
      <PageHead
        eyebrow="Übersicht"
        title="Was als Nächstes ansteht"
        lede="Alle Fristen aus Familie, Behörden, Finanzen und Reisen an einem Ort — nach Dringlichkeit sortiert."
      />

      <Horizon alerts={data.alerts} horizon={120} />

      <div className="stats">
        <Stat label="Überfällig" value={String(s.overdue)}
              tone={s.overdue > 0 ? "neg" : undefined}
              note={s.overdue > 0 ? "sofort erledigen" : "nichts liegen geblieben"} />
        <Stat label="Nächste 7 Tage" value={String(s.urgent)} note="dringende Fristen" />
        <Stat label="Fehlende Unterlagen" value={String(s.missingDocuments)}
              tone={s.missingDocuments > 0 ? "neg" : undefined} note="Pflichtdokumente" />
        <Stat label="Monatlicher Rest" value={euro(s.monthlyBalance)}
              tone={s.monthlyBalance < 0 ? "neg" : "pos"}
              note={`${euro(s.monthlyIncome)} Einnahmen`} />
        <Stat label="Offene Aufgaben" value={String(s.openTasks)} note="modulübergreifend" />
        {s.nextTripTitle && (
          <Stat label="Nächste Reise" value={`${s.nextTripInDays} Tage`} note={s.nextTripTitle} />
        )}
      </div>

      {data.insights.length > 0 && (
        <div className="insights">
          {data.insights.map((i) => (
            <div className="insight" key={i.id}>
              <span className="insight-icon" aria-hidden>{i.icon}</span>
              <span>
                {i.message}{" "}
                {i.actionPath && <Link to={i.actionPath}>Ansehen</Link>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="filters" role="group" aria-label="Hinweise filtern">
        {filters.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? "on" : ""}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {shown.length === 0
        ? <Empty title="Hier ist gerade nichts fällig."
                 hint="Sobald ein Dokument abläuft oder eine Frist näher rückt, taucht es hier auf." />
        : <div className="alert-list">{shown.map((a) => <AlertRow key={a.id} alert={a} />)}</div>}
    </>
  );
}
