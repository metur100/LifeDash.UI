import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { DashboardResponse } from "../api/types";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";

const links = [
  { to: "/", label: "Übersicht", icon: "fa-solid fa-table-columns", end: true },
  { to: "/family", label: "Familie", icon: "fa-solid fa-people-group" },
  { to: "/authorities", label: "Behörden", icon: "fa-solid fa-building-shield" },
  { to: "/finance", label: "Finanzen", icon: "fa-solid fa-wallet" },
  { to: "/contracts", label: "Verträge", icon: "fa-solid fa-file-signature" },
  { to: "/wishlist", label: "Wunschliste", icon: "fa-solid fa-gift" },
  { to: "/travel", label: "Reisen", icon: "fa-solid fa-plane-departure" },
  { to: "/documents", label: "Dokumente", icon: "fa-solid fa-folder-open" },
  { to: "/tasks", label: "Aufgaben", icon: "fa-solid fa-list-check" },
];

export default function Layout({ alertCount }: { alertCount: number }) {
  const { session, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navAlertCount, setNavAlertCount] = useState(alertCount);
  const location = useLocation();

  const refreshAlertCount = useCallback(async () => {
    try {
      const data = await api.get<DashboardResponse>("/api/dashboard?horizonDays=120");
      setNavAlertCount((data.summary.overdue ?? 0) + (data.summary.urgent ?? 0));
    } catch {
      // keep last shown count when dashboard endpoint is temporarily unavailable
    }
  }, []);

  useEffect(() => {
    setNavAlertCount(alertCount);
  }, [alertCount]);

  useEffect(() => {
    void refreshAlertCount();
  }, [location.pathname, refreshAlertCount]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAlertCount();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refreshAlertCount]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="shell">
      <button
        type="button"
        className="mobile-nav-launch"
        aria-label="Navigation öffnen"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        <i className="fa-solid fa-bars" aria-hidden />
      </button>
      {mobileOpen && <button type="button" className="rail-backdrop" aria-label="Navigation schließen" onClick={() => setMobileOpen(false)} />}

      <aside className={`rail ${mobileOpen ? "open" : ""}`}>
        <div className="rail-top">
          <button
            type="button"
            className="rail-toggle"
            aria-label="Navigation schließen"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(false)}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
          <div className="brand">
            <span className="brand-mark" aria-hidden><i className="fa-solid fa-layer-group" /></span>
            <span className="brand-name">Life Dashboard</span>
          </div>
        </div>

        <div className="rail-menu">
          <div>
          <p className="rail-group-label">Bereiche</p>
          <nav className="nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setMobileOpen(false)}>
                <span className="nav-icon" aria-hidden><i className={l.icon} /></span>
                {l.label}
                {l.to === "/" && navAlertCount > 0 && (
                  <span className="count" aria-label={`${navAlertCount} offene Hinweise`}>{navAlertCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <p className="rail-group-label" style={{ marginTop: 14 }}>Rechtliches</p>
          <nav className="nav">
            <NavLink to="/privacy" onClick={() => setMobileOpen(false)}>
              <span className="nav-icon" aria-hidden><i className="fa-solid fa-shield-halved" /></span>
              Datenschutz
            </NavLink>
            <NavLink to="/terms" onClick={() => setMobileOpen(false)}>
              <span className="nav-icon" aria-hidden><i className="fa-solid fa-file-contract" /></span>
              Nutzungsbedingungen
            </NavLink>
          </nav>
          </div>

          <div className="rail-foot">
            <span>{session?.displayName}</span>
            <div style={{ marginTop: 8 }}>
              <button
                className="btn ghost icon-only"
                aria-label={theme === "dark" ? "Helles Design aktivieren" : "Dunkles Design aktivieren"}
                title={theme === "dark" ? "Helles Design" : "Dunkles Design"}
                onClick={toggleTheme}
              >
                <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"}`} aria-hidden />
                <span className="sr-only">Theme wechseln</span>
              </button>{" "}
              <button className="btn ghost icon-only" aria-label="Abmelden" title="Abmelden" onClick={signOut}>
                <i className="fa-solid fa-right-from-bracket" aria-hidden />
                <span className="sr-only">Abmelden</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="main"><Outlet /></main>
    </div>
  );
}
