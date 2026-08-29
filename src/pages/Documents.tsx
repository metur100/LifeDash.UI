import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../api/client";
import type { Doc } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead } from "../components/Ui";
import { countdown, daysUntil, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const categories = ["family", "authority", "finance", "tax", "home", "travel", "insurance", "other"];
const categoryLabels: Record<string, string> = {
  family: "Familie", authority: "Behörden", finance: "Finanzen", tax: "Steuern",
  home: "Allgemein", travel: "Reisen", insurance: "Versicherung", other: "Sonstiges",
};

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
};

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_TOKEN_KEY = "ld_drive_access_token";
const DRIVE_TOKEN_EXP_KEY = "ld_drive_access_token_expires";
const DRIVE_PATH_KEY = "ld_drive_path";
const DRIVE_FOLDER_KEY = "ld_drive_folder";
const DRIVE_LINKED_KEY = "ld_drive_linked";

const DRIVE_EXPORT_MIME: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  "application/vnd.google-apps.presentation": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: "png" },
};

export default function Documents() {
  const docs = useAsync<Doc[]>(() => api.get("/api/documents"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [driveInfo, setDriveInfo] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [drivePath, setDrivePath] = useState<Array<{ id: string; name: string }>>([{ id: "root", name: "Meine Ablage" }]);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [filter, setFilter] = useState("all");
  const [driveBusy, setDriveBusy] = useState(false);
  const fileFor = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const driveToken = useRef<string | null>(null);
  const driveTokenExpiresAt = useRef<number>(0);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  function persistDrivePath(path: Array<{ id: string; name: string }>) {
    localStorage.setItem(DRIVE_PATH_KEY, JSON.stringify(path));
    const current = path[path.length - 1]?.id ?? "root";
    localStorage.setItem(DRIVE_FOLDER_KEY, current);
  }

  useEffect(() => {
    const storedToken = localStorage.getItem(DRIVE_TOKEN_KEY);
    const storedExp = Number(localStorage.getItem(DRIVE_TOKEN_EXP_KEY) ?? "0");
    const wasLinked = localStorage.getItem(DRIVE_LINKED_KEY) === "1";
    if (storedToken && storedExp > Date.now()) {
      driveToken.current = storedToken;
      driveTokenExpiresAt.current = storedExp;

      const rawPath = localStorage.getItem(DRIVE_PATH_KEY);
      const rawFolder = localStorage.getItem(DRIVE_FOLDER_KEY);
      let startPath: Array<{ id: string; name: string }> = [{ id: "root", name: "Meine Ablage" }];
      let startFolder = rawFolder || "root";

      if (rawPath) {
        try {
          const parsed = JSON.parse(rawPath) as Array<{ id: string; name: string }>;
          if (Array.isArray(parsed) && parsed.length > 0) startPath = parsed;
        } catch {
          // ignore invalid session state
        }
      }

      setDrivePath(startPath);

      void (async () => {
        setDriveBusy(true);
        try {
          const files = await fetchDriveFiles(startFolder, storedToken);
          setDriveFiles(files);
          setDriveInfo(`${files.length} Einträge in ${startPath[startPath.length - 1]?.name ?? "Meine Ablage"} geladen.`);
        } catch {
          // token may be expired/revoked; ignore and wait for explicit reconnect
        } finally {
          setDriveBusy(false);
        }
      })();
      return;
    }

    if (!wasLinked) return;

    let cancelled = false;
    let attempts = 0;

    const tryReconnect = () => {
      if (cancelled) return;
      attempts += 1;

      void (async () => {
        try {
          const token = await ensureDriveToken(false, false);
          if (cancelled) return;
          const rootPath = [{ id: "root", name: "Meine Ablage" }];
          setDrivePath(rootPath);
          persistDrivePath(rootPath);
          setDriveBusy(true);
          const files = await fetchDriveFiles("root", token);
          if (cancelled) return;
          setDriveFiles(files);
          setDriveInfo(`Google Drive ist verbunden. ${files.length} Einträge in Meine Ablage geladen.`);
        } catch {
          if (attempts < 10) window.setTimeout(tryReconnect, 600);
        } finally {
          if (!cancelled) setDriveBusy(false);
        }
      })();
    };

    tryReconnect();
    return () => {
      cancelled = true;
    };
  }, []);

  function getGoogle() {
    return (window as unknown as { google?: any }).google;
  }

  async function ensureDriveToken(forceRefresh = false, interactive = true) {
    const g = getGoogle();
    if (!googleClientId) throw new Error("Google Drive: setze VITE_GOOGLE_CLIENT_ID im Frontend.");
    if (!g?.accounts?.oauth2) throw new Error("Google Drive API ist noch nicht geladen.");

    const stillValid = !!driveToken.current && driveTokenExpiresAt.current > Date.now() + 30_000;
    if (!forceRefresh && stillValid && driveToken.current) return driveToken.current;

    return await new Promise<string>((resolve, reject) => {
      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
        callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || "Google Drive Auth fehlgeschlagen."));
            return;
          }
          driveToken.current = resp.access_token;
          const expAt = Date.now() + Math.max(60, Number(resp.expires_in ?? 3600)) * 1000;
          driveTokenExpiresAt.current = expAt;
          localStorage.setItem(DRIVE_TOKEN_KEY, resp.access_token);
          localStorage.setItem(DRIVE_TOKEN_EXP_KEY, String(expAt));
          resolve(resp.access_token);
        },
      });

      tokenClient.requestAccessToken({ prompt: interactive ? (driveToken.current ? "" : "consent") : "" });
    });
  }

  async function connectDrive() {
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const token = await ensureDriveToken();
      const rootPath = [{ id: "root", name: "Meine Ablage" }];
      setDrivePath(rootPath);
      persistDrivePath(rootPath);
      const files = await fetchDriveFiles("root", token);
      setDriveFiles(files);
      localStorage.setItem(DRIVE_LINKED_KEY, "1");
      setDriveInfo(`Google Drive ist verbunden. ${files.length} Einträge in Meine Ablage geladen.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function fetchDriveFiles(folderId = "root", token?: string) {
    const accessToken = token ?? await ensureDriveToken();
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=100&orderBy=folder,name_natural&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&q=${query}`, {
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
      const currentFolderId = drivePath[drivePath.length - 1]?.id ?? "root";
      const files = await fetchDriveFiles(currentFolderId);
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
      const currentFolderId = drivePath[drivePath.length - 1]?.id ?? "root";
      const files = driveFiles.length > 0 ? driveFiles : await fetchDriveFiles(currentFolderId);
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
      if (chosen.mimeType === DRIVE_FOLDER_MIME) {
        throw new Error("Ordner können nicht importiert werden. Bitte eine Datei wählen.");
      }
      await importDriveFile(chosen, String(values.category));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function openDriveFolder(folder: { id: string; name: string }) {
    setError(null);
    setDriveInfo(null);
    setPreviewFile(null);
    setDriveBusy(true);
    try {
      const files = await fetchDriveFiles(folder.id);
      setDriveFiles(files);
      setDrivePath((prev) => {
        const next = [...prev, folder];
        persistDrivePath(next);
        return next;
      });
      setDriveInfo(`${files.length} Einträge in ${folder.name} geladen.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  async function jumpToPath(index: number) {
    const target = drivePath[index];
    if (!target) return;
    setError(null);
    setDriveInfo(null);
    setPreviewFile(null);
    setDriveBusy(true);
    try {
      const files = await fetchDriveFiles(target.id);
      setDriveFiles(files);
      setDrivePath((prev) => {
        const next = prev.slice(0, index + 1);
        persistDrivePath(next);
        return next;
      });
      setDriveInfo(`${files.length} Einträge in ${target.name} geladen.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  }

  function openPreview(file: DriveFile) {
    setPreviewFile(file);
  }

  async function downloadDriveFile(file: DriveFile) {
    if (file.mimeType === DRIVE_FOLDER_MIME) return;
    setError(null);
    setDriveInfo(null);
    setDriveBusy(true);
    try {
      const token = await ensureDriveToken();
      const isGoogleNative = !!file.mimeType?.startsWith("application/vnd.google-apps.");
      const exportCfg = isGoogleNative
        ? (DRIVE_EXPORT_MIME[file.mimeType ?? ""] ?? { mime: "application/pdf", ext: "pdf" })
        : null;

      const url = isGoogleNative
        ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportCfg!.mime)}`
        : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Drive-Datei konnte nicht heruntergeladen werden.");

      const blob = await res.blob();
      let fileName = file.name;
      if (exportCfg && !fileName.toLowerCase().endsWith(`.${exportCfg.ext}`)) {
        fileName = `${fileName}.${exportCfg.ext}`;
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setDriveInfo(`Datei \"${fileName}\" wurde heruntergeladen.`);
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
      const available = (docs.data ?? []).filter((d) => !!d.originalName && !!d.storagePath);
      if (available.length === 0) {
        throw new Error("Kein lokales Dokument mit gespeicherter Datei zum Hochladen vorhanden. Lade zuerst eine Datei im Dokumenteintrag hoch.");
      }

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
      if (!fileRes.ok) {
        if (fileRes.status === 404) {
          throw new Error("Die Datei zum Dokument wurde auf dem Server nicht gefunden. Bitte Datei im Dokument neu hochladen und erneut versuchen.");
        }
        if (fileRes.status >= 500) {
          throw new Error("Die Dokumentdatei konnte serverseitig nicht gelesen werden. Bitte Datei im Dokument neu hochladen und erneut versuchen.");
        }
        throw new Error(`Dokumentdatei konnte nicht geladen werden (${fileRes.status}).`);
      }

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
            <div className="row" style={{ marginBottom: 10, gap: 6, flexWrap: "wrap" }}>
              {drivePath.map((p, i) => (
                <button
                  key={`${p.id}-${i}`}
                  className={`chip ${i === drivePath.length - 1 ? "on" : ""}`}
                  onClick={() => jumpToPath(i)}
                  disabled={driveBusy}
                  title={p.name}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="table-scroll docs-drive-table">
            <table className="docs-table">
              <thead>
                <tr><th>Drive-Datei</th><th>Typ</th><th>Geändert</th><th className="num action-col">Aktion</th></tr>
              </thead>
              <tbody>
                {driveFiles.slice(0, 20).map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.mimeType === DRIVE_FOLDER_MIME ? (
                        <button
                          className="btn ghost small"
                          onClick={() => openDriveFolder({ id: f.id, name: f.name })}
                          disabled={driveBusy}
                          title="Ordner öffnen"
                        >
                          <i className="fa-solid fa-folder-open" aria-hidden /> {f.name}
                        </button>
                      ) : (
                        <a href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`} target="_blank" rel="noreferrer">{f.name}</a>
                      )}
                    </td>
                    <td>{f.mimeType === DRIVE_FOLDER_MIME ? "Ordner" : (f.mimeType ?? "-")}</td>
                    <td>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleString("de-DE") : "-"}</td>
                    <td className="num action-cell">
                      <div className="action-stack">
                      {f.mimeType !== DRIVE_FOLDER_MIME && (
                        <>
                          <button
                            className="btn ghost small icon-only"
                            aria-label="Datei herunterladen"
                            title="Datei herunterladen"
                            onClick={() => downloadDriveFile(f)}
                            disabled={driveBusy}
                          >
                            <i className="fa-solid fa-download" aria-hidden />
                            <span className="sr-only">Herunterladen</span>
                          </button>{" "}
                          <button
                            className="btn ghost small icon-only"
                            aria-label="Vorschau in App"
                            title="Vorschau in App"
                            onClick={() => openPreview(f)}
                            disabled={driveBusy}
                          >
                            <i className="fa-solid fa-eye" aria-hidden />
                            <span className="sr-only">Vorschau</span>
                          </button>{" "}
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
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {driveFiles.length > 20 && (
              <p className="auth-hint" style={{ marginTop: 8 }}>
                Es werden 20 von {driveFiles.length} Drive-Dateien angezeigt. Mit Aktualisieren lädst du die aktuelle Liste neu.
              </p>
            )}
          </div>
        )}

        {previewFile && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>Vorschau: {previewFile.name}</strong>
              <div className="spacer" />
              <button
                className="btn ghost small icon-only"
                aria-label="Datei herunterladen"
                title="Datei herunterladen"
                onClick={() => downloadDriveFile(previewFile)}
              >
                <i className="fa-solid fa-download" aria-hidden />
                <span className="sr-only">Datei herunterladen</span>
              </button>{" "}
              <a
                className="btn ghost small icon-only"
                href={previewFile.webViewLink || `https://drive.google.com/file/d/${previewFile.id}/view`}
                target="_blank"
                rel="noreferrer"
                aria-label="In Google Drive öffnen"
                title="In Google Drive öffnen"
              >
                <i className="fa-solid fa-up-right-from-square" aria-hidden />
                <span className="sr-only">In Google Drive öffnen</span>
              </a>{" "}
              <button className="btn ghost small icon-only" aria-label="Vorschau schließen" title="Vorschau schließen" onClick={() => setPreviewFile(null)}>
                <i className="fa-solid fa-xmark" aria-hidden />
                <span className="sr-only">Vorschau schließen</span>
              </button>
            </div>
            <iframe
              title={`Drive Vorschau ${previewFile.name}`}
              src={`https://drive.google.com/file/d/${previewFile.id}/preview`}
              style={{ width: "100%", minHeight: 420, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}
            />
            <p className="auth-hint" style={{ marginTop: 8 }}>
              Hinweis: Manche Dateitypen oder Freigaben erlauben keine eingebettete Vorschau. Dann bitte über das Öffnen-Symbol in Google Drive ansehen.
            </p>
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
          : <div className="table-scroll docs-main-table"><table className="docs-table">
              <thead>
                <tr><th>Dokument</th><th>Kategorie</th><th>Läuft ab</th><th>Datei</th><th className="num action-col">Aktion</th></tr>
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
                      <td className="num action-cell">
                        <div className="action-stack">
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>}

      </div>
    </>
  );
}
