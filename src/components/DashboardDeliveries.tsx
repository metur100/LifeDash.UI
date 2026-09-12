import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { daysUntil, shortDate } from "../lib/format";
import { api } from "../api/client";
import type { PackageItem } from "../pages/Deliveries";

export default function DashboardDeliveries() {
  const [packages, setPackages] = useState<PackageItem[]>([]);

  useEffect(() => {
    api.get<PackageItem[]>("/api/packages").then(setPackages).catch(() => {
      // Dashboard widget stays hidden if packages can't be loaded — the Deliveries
      // page itself will surface the error.
    });
  }, []);

  const activePackages = useMemo(() => {
    return packages.filter((p) => p.status !== "delivered");
  }, [packages]);

  if (activePackages.length === 0) return null;

  return (
    <div className="dashboard-deliveries-widget">
      <div className="dashboard-deliveries-head">
        <div className="deliveries-head-title">
          <i className="fa-solid fa-box-open" aria-hidden />
          <h4>Anstehende Lieferungen ({activePackages.length})</h4>
        </div>
        <Link to="/deliveries" className="btn small ghost">
          Alle anzeigen <i className="fa-solid fa-arrow-right" aria-hidden />
        </Link>
      </div>

      <div className="dashboard-deliveries-list">
        {activePackages.slice(0, 3).map((pkg) => {
          const dueDays = pkg.expectedDelivery ? daysUntil(pkg.expectedDelivery) : null;
          const isToday = dueDays === 0 || pkg.status === "out_for_delivery";

          return (
            <div key={pkg.id} className={`dashboard-delivery-row ${isToday ? "highlight" : ""}`}>
              <div className="delivery-row-left">
                <span className={`carrier-tag ${pkg.carrier}`}>
                  {pkg.carrier.toUpperCase()}
                </span>
                <div className="delivery-row-info">
                  <strong>{pkg.title}</strong>
                  <span className="delivery-row-sub">
                    {pkg.sender ? `${pkg.sender} · ` : ""}
                    {pkg.latestEvent || "Unterwegs"}
                  </span>
                </div>
              </div>

              <div className="delivery-row-right">
                <span className="delivery-date-tag">
                  {pkg.expectedDelivery ? shortDate(pkg.expectedDelivery) : "Datum offen"}
                  {isToday && <strong> (Heute)</strong>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
