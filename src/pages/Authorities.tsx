import { useState } from "react";
import { api } from "../api/client";
import type { AuthorityCase, Doc } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead } from "../components/Ui";
import { countdown, daysUntil, shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const caseLabels: Record<string, string> = {
  Einbuergerung: "Einbürgerung", Aufenthalt: "Aufenthalt",
  Kindergeld: "Kindergeld", Kinderzuschlag: "Kinderzuschlag",
  Steuern: "Steuern", Versicherung: "Versicherung",
};

const statusTone: Record<string, string> = {
  open: "amber", waiting: "indigo", submitted: "indigo",
  approved: "green", rejected: "red", closed: "",
};

export default function Authorities() {
  const cases = useAsync<AuthorityCase[]>(() => api.get("/api/authority-cases"), []);
  const docs = useAsync<Doc[]>(() => api.get("/api/documents"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  async function createCase() {
    const values = await dialog.form({
      title: "Neuen Antrag anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Titel" },
        {
          key: "caseType",
          label: "Typ",
          type: "select",
          options: Object.entries(caseLabels).map(([value, label]) => ({ value, label })),
        },
        { key: "authority", label: "Behörde" },
        { key: "referenceNo", label: "Aktenzeichen" },
        { key: "deadlineOn", label: "Frist", type: "date" },
      ],
      initial: {
        title: "",
        caseType: "Aufenthalt",
        authority: "",
        referenceNo: "",
        deadlineOn: "",
      },
    });
    if (!values) return;

    const title = String(values.title).trim();
    if (!title) return;

    try {
      await api.post("/api/authority-cases", {
        caseType: String(values.caseType) || "Aufenthalt",
        title,
        authority: String(values.authority).trim() || null,
        referenceNo: String(values.referenceNo).trim() || null,
        status: "open",
        deadlineOn: String(values.deadlineOn).trim() || null,
        reminderDays: 21,
        requiredDocuments: [],
      });
      cases.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function link(caseId: number, reqId: number, documentId: number) {
    try {
      await api.post(`/api/authority-cases/${caseId}/required-documents/${reqId}/link/${documentId}`);
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function setStatus(c: AuthorityCase, status: string) {
    try {
      await api.put(`/api/authority-cases/${c.id}`, { ...c, status });
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editCase(c: AuthorityCase) {
    const values = await dialog.form({
      title: "Vorgang bearbeiten",
      submitText: "Speichern",
      fields: [
        { key: "title", label: "Titel" },
        { key: "authority", label: "Behörde" },
        { key: "referenceNo", label: "Aktenzeichen" },
        { key: "deadlineOn", label: "Frist", type: "date" },
      ],
      initial: {
        title: c.title,
        authority: c.authority ?? "",
        referenceNo: c.referenceNo ?? "",
        deadlineOn: c.deadlineOn ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/authority-cases/${c.id}`, {
        ...c,
        title: String(values.title).trim(),
        authority: String(values.authority).trim() || null,
        referenceNo: String(values.referenceNo).trim() || null,
        deadlineOn: String(values.deadlineOn).trim() || null,
      });
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeCase(id: number) {
    const ok = await dialog.confirm({
      title: "Vorgang löschen",
      message: "Diesen Vorgang wirklich löschen?",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/authority-cases/${id}`);
      cases.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const list = (cases.data ?? []).filter((c) => filter === "all" || c.caseType === filter);
  const missingTotal = (cases.data ?? [])
    .flatMap((c) => c.requiredDocuments)
    .filter((r) => r.isMandatory && !r.documentId).length;

  return (
    <>
      <PageHead eyebrow="Behörden" title="Anträge und Fristen"
        action={<button className="btn icon-only" aria-label="Antrag anlegen" title="Antrag anlegen" onClick={createCase}>
          <i className="fa-solid fa-plus" aria-hidden />
          <span className="sr-only">Antrag anlegen</span>
        </button>}
        lede={missingTotal > 0
          ? `${missingTotal} Pflichtdokumente fehlen noch. Ohne sie bleiben Anträge liegen.`
          : "Alle Pflichtdokumente sind hinterlegt."} />
      <ErrorBar message={error ?? cases.error} />

      <div className="filters">
        <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Alle</button>
        {Object.entries(caseLabels).map(([k, v]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{v}</button>
        ))}
      </div>

      {list.length === 0
        ? <Empty title="Kein Vorgang in dieser Kategorie." hint="Lege einen Antrag an, um Fristen und Unterlagen zu verfolgen." />
        : <div className="grid-2">
            {list.map((c) => {
              const days = daysUntil(c.deadlineOn);
              return (
                <article className="card" key={c.id}>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <span className="badge">{caseLabels[c.caseType] ?? c.caseType}</span>
                    <span className={`badge ${statusTone[c.status] ?? ""}`}>{c.status}</span>
                    <div className="spacer" />
                    {days !== null && (
                      <span className={`badge ${days < 0 ? "red" : days <= 14 ? "amber" : ""}`}>
                        {countdown(days)}
                      </span>
                    )}
                  </div>

                  <h3>{c.title}</h3>
                  <p className="alert-msg" style={{ marginTop: 0 }}>
                    {c.authority ?? "Behörde offen"}
                    {c.referenceNo ? ` · Az. ${c.referenceNo}` : ""}
                    {c.deadlineOn ? ` · Frist ${shortDate(c.deadlineOn)}` : ""}
                  </p>

                  <h3 style={{ marginTop: 14 }}>Unterlagen</h3>
                  <ul className="checklist">
                    {c.requiredDocuments.map((r) => (
                      <li key={r.id} className={r.isMandatory && !r.documentId ? "missing" : ""}>
                        <span className="mark" aria-hidden>{r.documentId ? "✓" : "○"}</span>
                        <span>
                          {r.name}
                          {!r.isMandatory && <span className="badge" style={{ marginLeft: 6 }}>optional</span>}
                          {r.dueOn && !r.documentId &&
                            <span className="alert-msg"> · bis {shortDate(r.dueOn)}</span>}
                        </span>
                        <div className="spacer" />
                        {!r.documentId && (
                          <select defaultValue="" aria-label={`Dokument für ${r.name} auswählen`}
                                  className="fit-select"
                                  onChange={(e) => e.target.value && link(c.id, r.id, Number(e.target.value))}>
                            <option value="">Dokument zuordnen …</option>
                            {(docs.data ?? []).map((d) => (
                              <option key={d.id} value={d.id}>{d.title}</option>
                            ))}
                          </select>
                        )}
                      </li>
                    ))}
                    {c.requiredDocuments.length === 0 && <li>Keine Unterlagen hinterlegt.</li>}
                  </ul>

                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn ghost small icon-only" aria-label="Als eingereicht markieren" title="Als eingereicht markieren" onClick={() => setStatus(c, "submitted")}>
                      <i className="fa-solid fa-paper-plane" aria-hidden />
                      <span className="sr-only">Eingereicht</span>
                    </button>
                    <button className="btn ghost small icon-only" aria-label="Als bewilligt markieren" title="Als bewilligt markieren" onClick={() => setStatus(c, "approved")}>
                      <i className="fa-solid fa-circle-check" aria-hidden />
                      <span className="sr-only">Bewilligt</span>
                    </button>
                    <button className="btn ghost small icon-only" aria-label="Vorgang abschließen" title="Vorgang abschließen" onClick={() => setStatus(c, "closed")}>
                      <i className="fa-solid fa-check-double" aria-hidden />
                      <span className="sr-only">Abschließen</span>
                    </button>
                    <button className="btn ghost small icon-only" aria-label="Vorgang bearbeiten" title="Vorgang bearbeiten" onClick={() => editCase(c)}>
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>
                    <button className="btn danger small icon-only" aria-label="Vorgang löschen" title="Vorgang löschen" onClick={() => removeCase(c.id)}>
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>}
    </>
  );
}
