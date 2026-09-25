import { useEffect, useState } from "react";
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

export const PAGE_SIZE = 10;

type Paged = { page: number; setPage: (p: number) => void; pageCount: number; total: number; pageSize: number };

// Client-side paging for any list. The page snaps back into range when the list shrinks
// (e.g. after a delete or a filter change), so a view never lands on an empty page.
export function usePaged<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const current = Math.min(page, pageCount);
  const pageItems = items.slice((current - 1) * pageSize, current * pageSize);
  return { pageItems, page: current, setPage, pageCount, total: items.length, pageSize };
}

// Page numbers to show: always first/last, a window around the current page, "…" for gaps.
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  const out: Array<number | "gap"> = [];
  for (let p = 1; p <= pageCount; p += 1) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

export function Pager({ paged }: { paged: Paged }) {
  const { page, setPage, pageCount, total, pageSize } = paged;
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pager" aria-label="Seiten">
      <span className="pager-info">{from}–{to} von {total}</span>
      <div className="pager-pages">
        <button type="button" className="btn ghost small icon-only" aria-label="Vorherige Seite" title="Vorherige Seite"
          disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <i className="fa-solid fa-chevron-left" aria-hidden />
        </button>
        {pageWindow(page, pageCount).map((p, i) => p === "gap"
          ? <span key={`gap-${i}`} className="pager-gap" aria-hidden>…</span>
          : <button key={p} type="button" className={`chip pager-num ${p === page ? "on" : ""}`}
              aria-current={p === page ? "page" : undefined} onClick={() => setPage(p)}>{p}</button>)}
        <button type="button" className="btn ghost small icon-only" aria-label="Nächste Seite" title="Nächste Seite"
          disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          <i className="fa-solid fa-chevron-right" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
