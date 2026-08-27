import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

const links = [
  { to: "/", label: "Übersicht", icon: "fa-solid fa-table-columns", end: true },
  { to: "/family", label: "Familie", icon: "fa-solid fa-people-group" },
  { to: "/authorities", label: "Behörden", icon: "fa-solid fa-building-shield" },
  { to: "/finance", label: "Finanzen", icon: "fa-solid fa-wallet" },
  { to: "/home-items", label: "Zuhause", icon: "fa-solid fa-house" },
  { to: "/travel", label: "Reisen", icon: "fa-solid fa-plane-departure" },
  { to: "/documents", label: "Dokumente", icon: "fa-solid fa-folder-open" },
  { to: "/tasks", label: "Aufgaben", icon: "fa-solid fa-list-check" },
];

export default function Layout({ alertCount }: { alertCount: number }) {
  const { session, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

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
                {l.to === "/" && alertCount > 0 && (
                  <span className="count" aria-label={`${alertCount} offene Hinweise`}>{alertCount}</span>
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
