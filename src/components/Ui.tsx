import type { ReactNode } from "react";

export function PageHead({ eyebrow, title, lede, action }:
  { eyebrow: string; title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {lede && <p className="lede">{lede}</p>}
        </div>
        <div className="spacer" />
        {action}
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return <div className="empty"><strong>{title}</strong>{hint}</div>;
}

export function ErrorBar({ message }: { message: string | null }) {
  return message ? <div className="error-bar" role="alert">{message}</div> : null;
}

export function Section({ title, action, children, className }:
  { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ""}`.trim()}>
      <div className="section-head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone, className }:
  { label: string; value: string; note?: string; tone?: "pos" | "neg"; className?: string }) {
  return (
    <div className={`stat ${className ?? ""}`.trim()}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
