import type { ChangeEvent } from "react";
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
  home: "Zuhause", travel: "Reisen", insurance: "Versicherung", other: "Sonstiges",
};

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

export default function Documents() {
  const docs = useAsync<Doc[]>(() => api.get("/api/documents"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [driveInfo, setDriveInfo] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [filter, setFilter] = useState("all");
  const [driveBusy, setDriveBusy] = useState(false);
  const fileFor = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const driveToken = useRef<string | null>(null);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

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
      const token = await ensureDriveToken();
      const files = await fetchDriveFiles(token);
      setDriveFiles(files);
      setDriveInfo(`Google Drive ist verbunden. ${files.length} Dateien geladen.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function fetchDriveFiles(token?: string) {
    const accessToken = token ?? await ensureDriveToken();
    const res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=50&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&q=trashed=false", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      let msg = `Drive-Dateien konnten nicht geladen werden (${res.status}).`;
      try {
        const body = await res.json() as {
          error?: {
            message?: string;
            details?: Array<{
              [key: string]: unknown;
              reason?: string;
              metadata?: { [key: string]: string | undefined };
            }>;
          };
        };

        const details = body.error?.details ?? [];
        const info = details.find((d) => d.reason === "SERVICE_DISABLED");
        const activationUrl = info?.metadata?.activationUrl;
        if (activationUrl) {
          msg = `Google Drive API ist im Google Cloud Projekt deaktiviert. Aktiviere sie hier und warte 1-5 Minuten: ${activationUrl}`;
        } else if (body.error?.message) {
          msg = body.error.message;
        }
      } catch {
        // keep default message if error response parsing fails
      }
      throw new Error(msg);
    }

    const body = await res.json() as { files?: DriveFile[] };
    return body.files ?? [];
  }

  async function refreshDriveFiles() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const files = await fetchDriveFiles();
      setDriveFiles(files);
      setDriveInfo(`${files.length} Drive-Dateien aktualisiert.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function importDriveFile(chosen: DriveFile, categoryDefault = "other") {
    const values = await dialog.form({
      title: "Drive-Datei importieren",
      submitText: "Importieren",
      fields: [
        {
          key: "category",
          label: "Kategorie",
          type: "select",
          options: categories.map((c) => ({ value: c, label: categoryLabels[c] })),
        },
      ],
      initial: {
        category: categoryDefault,
      },
    });
    if (!values) return;

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
    setDriveInfo(`Drive-Datei \"${chosen.name}\" wurde als Dokumenteintrag importiert.`);
  }

  async function importFromDrive() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const files = driveFiles.length > 0 ? driveFiles : await fetchDriveFiles();
      if (files.length === 0) throw new Error("Keine Dateien in Google Drive gefunden.");

      setDriveFiles(files);

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
      await importDriveFile(chosen, String(values.category));
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

  async function createDoc() {
    const values = await dialog.form({
      title: "Dokument anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Titel" },
        { key: "category", label: "Kategorie", type: "select", options: categories.map((c) => ({ value: c, label: categoryLabels[c] })) },
        { key: "documentType", label: "Art" },
        { key: "expiresOn", label: "Läuft ab am", type: "date" },
        { key: "reminderDays", label: "Erinnerung (Tage vorher)", type: "number" },
      ],
      initial: {
        title: "",
        category: "authority",
        documentType: "",
        expiresOn: "",
        reminderDays: "30",
      },
    });
    if (!values) return;
    if (!String(values.title).trim()) return;

    try {
      await api.post("/api/documents", {
        title: String(values.title).trim(),
        category: String(values.category),
        documentType: String(values.documentType).trim() || null,
        issuedOn: today(),
        expiresOn: String(values.expiresOn).trim() || null,
        reminderDays: Number(values.reminderDays || 30),
      });
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
        { key: "reminderDays", label: "Erinnerung (Tage vorher)", type: "number" },
      ],
      initial: {
        title: d.title,
        category: d.category,
        documentType: d.documentType ?? "",
        expiresOn: d.expiresOn ?? "",
        reminderDays: String(d.reminderDays),
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
        reminderDays: Number(values.reminderDays || d.reminderDays),
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
        action={<button className="btn icon-only" aria-label="Dokument anlegen" title="Dokument anlegen" onClick={createDoc}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Dokument anlegen</span></button>}
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
          <button className="btn ghost small icon-only" aria-label="Drive-Dateien aktualisieren" title="Drive-Dateien aktualisieren" onClick={refreshDriveFiles} disabled={driveBusy}>
            <i className="fa-solid fa-rotate" aria-hidden />
            <span className="sr-only">Drive-Dateien aktualisieren</span>
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

        {driveFiles.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th>Drive-Datei</th><th>Typ</th><th>Geändert</th><th className="num">Aktion</th></tr>
              </thead>
              <tbody>
                {driveFiles.slice(0, 20).map((f) => (
                  <tr key={f.id}>
                    <td>
                      <a href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noreferrer">{f.name}</a>
                    </td>
                    <td>{f.mimeType ?? "-"}</td>
                    <td>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleString("de-DE") : "-"}</td>
                    <td className="num">
                      <button
                        className="btn ghost small icon-only"
                        aria-label="Drive-Datei importieren"
                        title="Drive-Datei importieren"
                        onClick={() => importDriveFile(f)}
                        disabled={driveBusy}
                      >
                        <i className="fa-solid fa-file-import" aria-hidden />
                        <span className="sr-only">Importieren</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {driveFiles.length > 20 && (
              <p className="auth-hint" style={{ marginTop: 8 }}>
                Es werden 20 von {driveFiles.length} Drive-Dateien angezeigt. Mit Aktualisieren lädst du die aktuelle Liste neu.
              </p>
            )}
          </div>
        )}
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
          ? <Empty title="Keine Dokumente in dieser Kategorie." hint="Lege ein Dokument über das Plus an und lade die Datei hoch." />
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

      </div>
    </>
  );
}
