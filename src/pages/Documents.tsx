import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { api, getToken } from "../api/client";
import type { Doc } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead } from "../components/Ui";
import { countdown, daysUntil, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const categories = ["family", "authority", "finance", "tax", "home", "travel", "insurance", "other"];
const categoryLabels: Record<string, string> = {
  family: "Familie", authority: "Behörden", finance: "Finanzen", tax: "Steuern",
  home: "Haushalt", travel: "Reisen", insurance: "Versicherung", other: "Sonstiges",
};

export default function Documents() {
  const docs = useAsync<Doc[]>(() => api.get("/api/documents"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [driveInfo, setDriveInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState({ title: "", category: "authority", documentType: "", expiresOn: "" });
  const [driveBusy, setDriveBusy] = useState(false);
  const fileFor = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const driveToken = useRef<string | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  function getGoogle() {
    return (window as unknown as { google?: any }).google;
  }

  async function ensureDriveToken() {
    const g = getGoogle();
    if (!googleClientId) throw new Error("Google Drive: setze VITE_GOOGLE_CLIENT_ID im Frontend.");
    if (!g?.accounts?.oauth2) throw new Error("Google Drive API ist noch nicht geladen.");

    return await new Promise<string>((resolve, reject) => {
      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
        callback: (resp: { access_token?: string; error?: string }) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || "Google Drive Auth fehlgeschlagen."));
            return;
          }
          driveToken.current = resp.access_token;
          resolve(resp.access_token);
        },
      });

      tokenClient.requestAccessToken({ prompt: driveToken.current ? "" : "consent" });
    });
  }

  async function connectDrive() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      await ensureDriveToken();
      setDriveInfo("Google Drive ist verbunden.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function importFromDrive() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const token = await ensureDriveToken();
      const res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&q=trashed=false", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Drive-Dateien konnten nicht geladen werden.");

      const body = await res.json() as {
        files?: Array<{ id: string; name: string; mimeType?: string; webViewLink?: string }>;
      };
      const files = body.files ?? [];
      if (files.length === 0) throw new Error("Keine Dateien in Google Drive gefunden.");

      const values = await dialog.form({
        title: "Datei aus Google Drive importieren",
        submitText: "Importieren",
        fields: [
          {
            key: "fileId",
            label: "Drive-Datei",
            type: "select",
            options: files.map((f) => ({ value: f.id, label: f.name })),
          },
          {
            key: "category",
            label: "Kategorie",
            type: "select",
            options: categories.map((c) => ({ value: c, label: categoryLabels[c] })),
          },
        ],
        initial: {
          fileId: files[0]?.id ?? "",
          category: "other",
        },
      });
      if (!values) return;

      const chosen = files.find((f) => f.id === String(values.fileId));
      if (!chosen) return;

      const driveLink = chosen.webViewLink || `https://drive.google.com/file/d/${chosen.id}/view`;

      await api.post("/api/documents", {
        title: chosen.name,
        category: String(values.category),
        documentType: "google-drive",
        issuedOn: today(),
        expiresOn: null,
        reminderDays: 30,
        notes: `Google Drive: ${driveLink}`,
      });

      docs.reload();
      setDriveInfo(`Drive-Datei "${chosen.name}" wurde als Dokumenteintrag importiert.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function uploadToDrive() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const token = await ensureDriveToken();
      const available = (docs.data ?? []).filter((d) => !!d.originalName);
      if (available.length === 0) throw new Error("Kein lokales Dokument mit Datei zum Hochladen vorhanden.");

      const values = await dialog.form({
        title: "Dokument nach Google Drive hochladen",
        submitText: "Hochladen",
        fields: [
          {
            key: "docId",
            label: "Dokument",
            type: "select",
            options: available.map((d) => ({ value: String(d.id), label: d.originalName || d.title })),
          },
        ],
        initial: {
          docId: String(available[0]?.id ?? ""),
        },
      });
      if (!values) return;

      const selected = available.find((d) => d.id === Number(values.docId));
      if (!selected) return;

      const jwt = getToken();
      if (!jwt) throw new Error("Nicht angemeldet.");

      const fileRes = await fetch(api.fileUrl(selected.id), {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!fileRes.ok) throw new Error("Dokumentdatei konnte nicht geladen werden.");

      const blob = await fileRes.blob();
      const filename = selected.originalName || `${selected.title}.bin`;
      const metadata = { name: filename };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new File([blob], filename, { type: selected.contentType || blob.type || "application/octet-stream" }));

      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!uploadRes.ok) throw new Error("Upload zu Google Drive fehlgeschlagen.");

      const uploaded = await uploadRes.json() as { id: string; name: string; webViewLink?: string };
      const link = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
      const currentNotes = selected.notes?.trim() ?? "";
      const extra = `Google Drive: ${link}`;
      const mergedNotes = currentNotes ? `${currentNotes}\n${extra}` : extra;

      await api.put(`/api/documents/${selected.id}`, {
        ...selected,
        notes: mergedNotes,
      });

      docs.reload();
      setDriveInfo(`Dokument "${uploaded.name}" wurde nach Google Drive hochgeladen.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    try {
      await api.post("/api/documents", {
        title: draft.title,
        category: draft.category,
        documentType: draft.documentType || null,
        issuedOn: today(),
        expiresOn: draft.expiresOn || null,
        reminderDays: 30,
      });
      setDraft({ title: "", category: "authority", documentType: "", expiresOn: "" });
      docs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  function pickFile(id: number) {
    fileFor.current = id;
    fileInput.current?.click();
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = fileFor.current;
    e.target.value = "";
    if (!file || id === null) return;
    try {
      await api.upload(`/api/documents/${id}/file`, file);
      docs.reload();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove(id: number) {
    const ok = await dialog.confirm({ title: "Dokument löschen", message: "Dokument wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try { await api.del(`/api/documents/${id}`); docs.reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function editDoc(d: Doc) {
    const values = await dialog.form({
      title: "Dokument bearbeiten",
      fields: [
        { key: "title", label: "Titel" },
        { key: "category", label: "Kategorie", type: "select", options: categories.map((c) => ({ value: c, label: categoryLabels[c] })) },
        { key: "documentType", label: "Art" },
        { key: "expiresOn", label: "Läuft ab am", type: "date" },
      ],
      initial: {
        title: d.title,
        category: d.category,
        documentType: d.documentType ?? "",
        expiresOn: d.expiresOn ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/documents/${d.id}`, {
        ...d,
        title: String(values.title).trim(),
        category: String(values.category),
        documentType: String(values.documentType).trim() || null,
        expiresOn: String(values.expiresOn).trim() || null,
      });
      docs.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const list = (docs.data ?? [])
    .filter((d) => filter === "all" || d.category === filter)
    .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999"));

  return (
    <>
      <PageHead eyebrow="Dokumente" title="Ablage mit Ablaufdatum"
        lede="Jedes Dokument mit Ablaufdatum meldet sich rechtzeitig auf der Übersicht." />
      <ErrorBar message={error ?? docs.error} />

      <div className="card drive-tools" style={{ marginBottom: 14 }}>
        <div className="row">
          <strong>Google Drive</strong>
          <div className="spacer" />
          <button className="btn ghost small icon-only" aria-label="Google Drive verbinden" title="Google Drive verbinden" onClick={connectDrive} disabled={driveBusy}>
            <i className="fa-brands fa-google-drive" aria-hidden />
            <span className="sr-only">Google Drive verbinden</span>
          </button>
          <button className="btn ghost small icon-only" aria-label="Aus Google Drive importieren" title="Aus Google Drive importieren" onClick={importFromDrive} disabled={driveBusy}>
            <i className="fa-solid fa-file-import" aria-hidden />
            <span className="sr-only">Aus Google Drive importieren</span>
          </button>
          <button className="btn ghost small icon-only" aria-label="Nach Google Drive hochladen" title="Nach Google Drive hochladen" onClick={uploadToDrive} disabled={driveBusy}>
            <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
            <span className="sr-only">Nach Google Drive hochladen</span>
          </button>
        </div>
        <p className="auth-hint" style={{ margin: "8px 0 0" }}>
          {driveBusy ? "Google Drive Aktion läuft …" : driveInfo ?? "Verbinden, Dateien aus Drive importieren oder lokale Dokumentdateien zu Drive hochladen."}
        </p>
      </div>

      <input type="file" ref={fileInput} onChange={upload} style={{ display: "none" }} />

      <div className="filters">
        <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Alle</button>
        {categories.map((c) => (
          <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>
            {categoryLabels[c]}
          </button>
        ))}
      </div>

      <div className="card">
        {list.length === 0
          ? <Empty title="Keine Dokumente in dieser Kategorie." hint="Lege unten ein Dokument an und lade die Datei hoch." />
          : <table>
              <thead>
                <tr><th>Dokument</th><th>Kategorie</th><th>Läuft ab</th><th>Datei</th><th className="num">Aktion</th></tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const days = daysUntil(d.expiresOn);
                  return (
                    <tr key={d.id}>
                      <td><strong>{d.title}</strong>{d.documentType && <div className="alert-msg">{d.documentType}</div>}</td>
                      <td><span className="badge">{categoryLabels[d.category] ?? d.category}</span></td>
                      <td>
                        {d.expiresOn
                          ? <span className={`badge ${days !== null && days < 0 ? "red" : days !== null && days <= 60 ? "amber" : "green"}`}>
                              {shortDate(d.expiresOn)} · {countdown(days)}
                            </span>
                          : "unbefristet"}
                      </td>
                      <td>
                        {d.originalName
                          ? <a href={api.fileUrl(d.id)} target="_blank" rel="noreferrer">{d.originalName}</a>
                          : <span className="alert-msg">keine Datei</span>}
                      </td>
                      <td className="num">
                        <button className="btn ghost small icon-only" aria-label="Dokument bearbeiten" title="Dokument bearbeiten" onClick={() => editDoc(d)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>{" "}
                        <button className="btn ghost small icon-only" aria-label={d.originalName ? "Datei ersetzen" : "Datei hochladen"} title={d.originalName ? "Datei ersetzen" : "Datei hochladen"} onClick={() => pickFile(d.id)}>
                          <i className={`fa-solid ${d.originalName ? "fa-arrows-rotate" : "fa-upload"}`} aria-hidden />
                          <span className="sr-only">{d.originalName ? "Ersetzen" : "Hochladen"}</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Dokument löschen" title="Dokument löschen" onClick={() => remove(d.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>}

        <form className="form-grid" style={{ marginTop: 18 }} onSubmit={create}>
          <label className="field">Titel
            <input value={draft.title} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">Kategorie
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
            </select>
          </label>
          <label className="field">Art
            <input value={draft.documentType} placeholder="z. B. Reisepass"
                   onChange={(e) => setDraft({ ...draft, documentType: e.target.value })} />
          </label>
          <label className="field">Läuft ab am
            <input type="date" value={draft.expiresOn}
                   onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })} />
          </label>
          <label className="field">&nbsp;
            <button className="btn icon-only" aria-label="Dokument anlegen" title="Dokument anlegen">
              <i className="fa-solid fa-plus" aria-hidden />
              <span className="sr-only">Dokument anlegen</span>
            </button>
          </label>
        </form>
      </div>
    </>
  );
}
