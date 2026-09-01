import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import DOMPurify from "dompurify";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  expires_in?: number;
};

type GoogleTokenClient = {
  requestAccessToken: (options: { prompt: string }) => void;
};

type GmailMessageSummary = {
  id: string;
  threadId: string;
};

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    filename?: string;
    mimeType?: string;
    body?: { attachmentId?: string; data?: string };
    parts?: GmailPart[];
  };
};

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string };
  parts?: GmailPart[];
};

type MailItem = GmailMessage & {
  from: string;
  subject: string;
  date: string;
};

type Mailbox = "inbox" | "sent" | "trash";

type GmailLabel = {
  id: string;
  name: string;
  type: "system" | "user";
};

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => GoogleTokenClient;
      };
    };
  };
};

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send";
const GMAIL_SCOPE_VERSION = "2";
const GMAIL_TOKEN_KEY = "ld_gmail_access_token";
const GMAIL_TOKEN_EXP_KEY = "ld_gmail_access_token_expires";
const GMAIL_TOKEN_SCOPE_VERSION_KEY = "ld_gmail_access_token_scope_version";

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function formatMailDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function attachmentsFor(part?: GmailPart): GmailPart[] {
  if (!part) return [];
  const nested = (part.parts ?? []).flatMap((child) => attachmentsFor(child));
  return part.filename && part.body?.attachmentId ? [part, ...nested] : nested;
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeMail(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function Mail() {
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  const dialog = useDialog();
  const token = useRef<string | null>(null);
  const tokenExpiresAt = useRef(0);
  const [messages, setMessages] = useState<MailItem[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selected, setSelected] = useState<GmailMessage | null>(null);
  const [mailbox, setMailbox] = useState<Mailbox>("inbox");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    const storedToken = localStorage.getItem(GMAIL_TOKEN_KEY);
    const storedExpiry = Number(localStorage.getItem(GMAIL_TOKEN_EXP_KEY) ?? "0");
    const storedScopeVersion = localStorage.getItem(GMAIL_TOKEN_SCOPE_VERSION_KEY);
    if (!storedToken || storedExpiry <= Date.now() || storedScopeVersion !== GMAIL_SCOPE_VERSION) return;

    token.current = storedToken;
    tokenExpiresAt.current = storedExpiry;
    void loadMessages(storedToken);
  }, []);

  function getGoogle() {
    return (window as GoogleWindow).google;
  }

  async function ensureToken() {
    if (!googleClientId) throw new Error("Gmail: setze VITE_GOOGLE_CLIENT_ID im Frontend.");
    const google = getGoogle();
    if (!google?.accounts?.oauth2) throw new Error("Google OAuth ist noch nicht geladen.");
    const oauth2 = google.accounts.oauth2;
    if (token.current && tokenExpiresAt.current > Date.now() + 30_000) return token.current;

    return await new Promise<string>((resolve, reject) => {
      const tokenClient = oauth2.initTokenClient({
        client_id: googleClientId,
        scope: GMAIL_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error || "Gmail-Autorisierung fehlgeschlagen."));
            return;
          }

          token.current = response.access_token;
          const expiresAt = Date.now() + Math.max(60, Number(response.expires_in ?? 3600)) * 1000;
          tokenExpiresAt.current = expiresAt;
          localStorage.setItem(GMAIL_TOKEN_KEY, response.access_token);
          localStorage.setItem(GMAIL_TOKEN_EXP_KEY, String(expiresAt));
          localStorage.setItem(GMAIL_TOKEN_SCOPE_VERSION_KEY, GMAIL_SCOPE_VERSION);
          resolve(response.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: token.current ? "" : "consent" });
    });
  }

  async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
    return gmailRequest<T>(path, accessToken);
  }

  async function gmailRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("Gmail API ist im Google Cloud Projekt nicht aktiviert oder der Zugriff wurde nicht freigegeben.");
      }
      throw new Error(`Gmail konnte nicht geladen werden (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async function loadMessages(accessToken?: string, search = query, targetMailbox = mailbox) {
    setBusy(true);
    setError(null);
    try {
      const resolvedToken = accessToken ?? await ensureToken();
      const label = targetMailbox === "inbox" ? "INBOX" : targetMailbox === "sent" ? "SENT" : "TRASH";
      const params = new URLSearchParams({ maxResults: "30", labelIds: label });
      if (search.trim()) params.set("q", search.trim());
      const [list, labelList] = await Promise.all([
        gmailFetch<{ messages?: GmailMessageSummary[] }>(`messages?${params}`, resolvedToken),
        gmailFetch<{ labels?: GmailLabel[] }>("labels", resolvedToken),
      ]);
      setLabels((labelList.labels ?? []).filter((item) => item.type === "user" || item.id === "STARRED" || item.id === "IMPORTANT"));
      const summaries = list.messages ?? [];
      const loaded = await Promise.all(summaries.map(async ({ id }) => {
        const message = await gmailFetch<GmailMessage>(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, resolvedToken);
        return {
          ...message,
          from: headerValue(message, "From") || "Unbekannter Absender",
          subject: headerValue(message, "Subject") || "(Ohne Betreff)",
          date: headerValue(message, "Date"),
        };
      }));
      setMessages(loaded);
      setStatus(`${loaded.length} Nachrichten geladen.`);
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setStatus(null);
    try {
      const accessToken = await ensureToken();
      await loadMessages(accessToken);
    } catch (exception) {
      setError((exception as Error).message);
    }
  }

  async function openMessage(id: string) {
    if (selected?.id === id) {
      setSelected(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      setSelected(await gmailFetch<GmailMessage>(`messages/${id}?format=full`, accessToken));
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeReadState(read: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      const updated = await gmailRequest<GmailMessage>(`messages/${selected.id}/modify`, accessToken, {
        method: "POST",
        body: JSON.stringify(read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] }),
      });
      setSelected(updated);
      setMessages((current) => current.map((message) => message.id === updated.id ? { ...message, labelIds: updated.labelIds } : message));
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash() {
    if (!selected || !await dialog.confirm({ title: "E-Mail löschen", message: "Diese Nachricht wird in den Gmail-Papierkorb verschoben.", confirmText: "In Papierkorb", danger: true })) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      await gmailRequest<void>(`messages/${selected.id}/trash`, accessToken, { method: "POST" });
      setMessages((current) => current.filter((message) => message.id !== selected.id));
      setSelected(null);
      setStatus("Nachricht in den Papierkorb verschoben.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveMessage() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      await gmailRequest<GmailMessage>(`messages/${selected.id}/modify`, accessToken, { method: "POST", body: JSON.stringify({ removeLabelIds: ["INBOX"] }) });
      setMessages((current) => current.filter((message) => message.id !== selected.id));
      setSelected(null);
      setStatus("Nachricht archiviert.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLabel(labelId: string) {
    if (!selected || !labelId) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      const hasLabel = selected.labelIds?.includes(labelId);
      const updated = await gmailRequest<GmailMessage>(`messages/${selected.id}/modify`, accessToken, {
        method: "POST",
        body: JSON.stringify(hasLabel ? { removeLabelIds: [labelId] } : { addLabelIds: [labelId] }),
      });
      setSelected(updated);
      setMessages((current) => current.map((message) => message.id === updated.id ? { ...message, labelIds: updated.labelIds } : message));
      setStatus(hasLabel ? "Label entfernt." : "Label hinzugefügt.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromTrash() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      await gmailRequest<GmailMessage>(`messages/${selected.id}/untrash`, accessToken, { method: "POST" });
      setMessages((current) => current.filter((message) => message.id !== selected.id));
      setSelected(null);
      setStatus("Nachricht aus dem Papierkorb wiederhergestellt.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDelete() {
    if (!selected || !await dialog.confirm({ title: "Endgültig löschen", message: "Diese Nachricht wird unwiderruflich aus Gmail gelöscht.", confirmText: "Endgültig löschen", danger: true })) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      await gmailRequest<void>(`messages/${selected.id}`, accessToken, { method: "DELETE" });
      setMessages((current) => current.filter((message) => message.id !== selected.id));
      setSelected(null);
      setStatus("Nachricht endgültig gelöscht.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openComposer(mode: "new" | "reply" | "forward" = "new") {
    if (mode !== "new" && selected) {
      setRecipient(mode === "reply" ? addressFromHeader(headerValue(selected, "Reply-To") || headerValue(selected, "From")) : "");
      const originalSubject = headerValue(selected, "Subject") || "(Ohne Betreff)";
      setSubject(`${mode === "reply" ? "Re: " : "Fwd: "}${originalSubject.replace(/^(Re: |Fwd: )/i, "")}`);
      setBody(mode === "forward" ? `\n\n--- Weitergeleitete Nachricht ---\nVon: ${headerValue(selected, "From")}\nDatum: ${headerValue(selected, "Date")}\nBetreff: ${originalSubject}\n\n${selected.snippet ?? ""}` : "");
    }
    setComposerOpen(true);
  }

  async function openAttachment(part: GmailPart) {
    if (!selected || !part.body?.attachmentId) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      const attachment = await gmailFetch<{ data: string }>(`messages/${selected.id}/attachments/${part.body.attachmentId}`, accessToken);
      const blob = new Blob([base64UrlToBytes(attachment.data)], { type: part.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!recipient.trim() || !subject.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const accessToken = await ensureToken();
      const boundary = `lifedash-${crypto.randomUUID()}`;
      const attachmentParts = await Promise.all(files.map(async (file) => `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}; name="${file.name}"\r\nContent-Disposition: attachment; filename="${file.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${await fileAsBase64(file)}\r\n`));
      const content = files.length === 0
        ? `To: ${recipient.trim()}\r\nSubject: ${subject.trim()}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`
        : `To: ${recipient.trim()}\r\nSubject: ${subject.trim()}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n${attachmentParts.join("")}--${boundary}--`;
      const raw = encodeMail(content);
      await gmailRequest("messages/send", accessToken, { method: "POST", body: JSON.stringify({ raw }) });
      setComposerOpen(false);
      setRecipient("");
      setSubject("");
      setBody("");
      setFiles([]);
      setStatus("E-Mail wurde gesendet.");
    } catch (exception) {
      setError((exception as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const connected = !!token.current && tokenExpiresAt.current > Date.now();
  const selectedActions = selected && <div className="row gap">
    <button className="btn ghost small icon-only" aria-label="Antworten" title="Antworten" onClick={() => openComposer("reply")} disabled={busy}><i className="fa-solid fa-reply" aria-hidden /></button>
    <button className="btn ghost small icon-only" aria-label="Weiterleiten" title="Weiterleiten" onClick={() => openComposer("forward")} disabled={busy}><i className="fa-solid fa-share" aria-hidden /></button>
    <select className="mail-label-control" aria-label="Gmail-Label umschalten" defaultValue="" onChange={(event) => { void toggleLabel(event.target.value); event.currentTarget.value = ""; }} disabled={busy}>
      <option value="">Label</option>
      {labels.map((label) => <option key={label.id} value={label.id}>{selected.labelIds?.includes(label.id) ? `Entfernen: ${label.name}` : `Hinzufügen: ${label.name}`}</option>)}
    </select>
    <button className="btn ghost small icon-only" aria-label={selected.labelIds?.includes("UNREAD") ? "Als gelesen markieren" : "Als ungelesen markieren"} title={selected.labelIds?.includes("UNREAD") ? "Als gelesen markieren" : "Als ungelesen markieren"} onClick={() => void changeReadState(!!selected.labelIds?.includes("UNREAD"))} disabled={busy}><i className={`fa-solid ${selected.labelIds?.includes("UNREAD") ? "fa-envelope-open" : "fa-envelope"}`} aria-hidden /></button>
    {!selected.labelIds?.includes("TRASH") && <button className="btn ghost small icon-only" aria-label="Archivieren" title="Archivieren" onClick={() => void archiveMessage()} disabled={busy}><i className="fa-solid fa-box-archive" aria-hidden /></button>}
    <button className="btn danger small icon-only" aria-label="In Papierkorb verschieben" title="In Papierkorb verschieben" onClick={() => void moveToTrash()} disabled={busy}><i className="fa-solid fa-trash" aria-hidden /></button>
    {selected.labelIds?.includes("TRASH") && <><button className="btn ghost small icon-only" aria-label="Wiederherstellen" title="Wiederherstellen" onClick={() => void restoreFromTrash()} disabled={busy}><i className="fa-solid fa-trash-arrow-up" aria-hidden /></button><button className="btn danger small icon-only" aria-label="Endgültig löschen" title="Endgültig löschen" onClick={() => void permanentlyDelete()} disabled={busy}><i className="fa-solid fa-trash-can" aria-hidden /></button></>}
  </div>;

  return (
    <>
      <PageHead
        eyebrow="Google"
        title="E-Mail"
        lede="Gmail-Posteingang lesen und durchsuchen."
        action={<div className="row gap">
          <button className="btn ghost icon-only" aria-label="Neue E-Mail schreiben" title="Neue E-Mail schreiben" onClick={() => openComposer()} disabled={busy || !connected}>
            <i className="fa-solid fa-pen" aria-hidden />
          </button>
          <button className="btn ghost icon-only" aria-label="Posteingang aktualisieren" title="Posteingang aktualisieren" onClick={() => void loadMessages()} disabled={busy || !connected}>
            <i className="fa-solid fa-rotate" aria-hidden />
          </button>
          <button className="btn primary" onClick={() => void connect()} disabled={busy}>
            <i className="fa-brands fa-google" aria-hidden /> {connected ? "Gmail aktualisieren" : "Gmail verbinden"}
          </button>
        </div>}
      />

      <ErrorBar message={error} />
      {status && <p className="auth-hint" style={{ margin: "0 0 14px" }}>{status}</p>}

      {composerOpen && <Section title="Neue E-Mail" action={<button className="btn ghost small icon-only" aria-label="E-Mail schließen" title="E-Mail schließen" onClick={() => setComposerOpen(false)}><i className="fa-solid fa-xmark" aria-hidden /></button>}>
        <form className="mail-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="An" aria-label="Empfänger" type="email" required />
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Betreff" aria-label="Betreff" required />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Nachricht" aria-label="Nachricht" rows={7} />
          <label className="mail-file-picker"><i className="fa-solid fa-paperclip" aria-hidden /> Anhang auswählen<input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
          {files.length > 0 && <div className="mail-file-list">{files.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}</div>}
          <div><button className="btn primary" type="submit" disabled={busy}>Senden</button></div>
        </form>
      </Section>}

      <div className="mail-layout">
        <Section title="Posteingang">
          <div className="mail-tabs" role="tablist" aria-label="E-Mail-Ordner">
            {(["inbox", "sent", "trash"] as Mailbox[]).map((item) => <button key={item} className={mailbox === item ? "active" : ""} type="button" role="tab" aria-selected={mailbox === item} onClick={() => { setMailbox(item); setSelected(null); void loadMessages(undefined, query, item); }} disabled={busy}>{item === "inbox" ? "Posteingang" : item === "sent" ? "Gesendet" : "Papierkorb"}</button>)}
          </div>
          <form className="mail-search" onSubmit={(event) => { event.preventDefault(); void loadMessages(); }}>
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gmail durchsuchen" aria-label="Gmail durchsuchen" disabled={!connected || busy} />
            <button className="btn ghost small" type="submit" disabled={!connected || busy}>Suchen</button>
          </form>
          {!connected && !busy ? (
            <Empty title="Gmail noch nicht verbunden" hint="Verbinde dein Google-Konto, um die neuesten Inbox-Nachrichten zu laden." />
          ) : messages.length === 0 && !busy ? (
            <Empty title="Keine Nachrichten gefunden" hint="Passe die Suche an oder aktualisiere den Posteingang." />
          ) : (
            <div className="mail-list">
              {messages.map((message) => {
                const unread = message.labelIds?.includes("UNREAD");
                return <div key={message.id} className="mail-row-wrap">
                  <button className={`mail-row ${unread ? "unread" : ""} ${selected?.id === message.id ? "selected" : ""}`} type="button" onClick={() => void openMessage(message.id)}>
                    <span className="mail-state"><i className={`fa-solid ${unread ? "fa-envelope" : "fa-envelope-open"}`} aria-hidden /></span>
                    <span className="mail-copy"><strong>{message.subject}</strong><span className="mail-from">{message.from}</span><span className="mail-preview">{message.snippet}</span></span>
                    <time className="mail-date">{formatMailDate(message.date)}</time>
                  </button>
                  {selected?.id === message.id && <div className="mail-inline-detail"><MailMessageContent message={selected} onAttachment={openAttachment} busy={busy} actions={selectedActions} /></div>}
                </div>;
              })}
            </div>
          )}
        </Section>

      </div>
    </>
  );
}

function decodedPartBody(part?: GmailPart): string | null {
  if (!part?.body?.data) return null;
  return new TextDecoder().decode(base64UrlToBytes(part.body.data));
}

function htmlBodyFor(part?: GmailPart): string | null {
  if (!part) return null;
  if (part.mimeType === "text/html") return decodedPartBody(part);
  for (const child of part.parts ?? []) {
    const body = htmlBodyFor(child);
    if (body) return body;
  }
  return null;
}

function addressFromHeader(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value.trim();
}

async function fileAsBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function MailMessageContent({ message, onAttachment, busy, actions }: { message: GmailMessage; onAttachment: (part: GmailPart) => Promise<void>; busy: boolean; actions?: ReactNode }) {
  const sanitizedHtml = htmlBodyFor(message.payload);
  const attachments = attachmentsFor(message.payload);
  return <article className="mail-detail">
    <h2>{headerValue(message, "Subject") || "(Ohne Betreff)"}</h2>
    {actions && <div className="mail-actions">{actions}</div>}
    <div className="mail-meta">
      <div><span>Von</span><strong>{headerValue(message, "From")}</strong></div>
      <div><span>An</span><strong>{headerValue(message, "To")}</strong></div>
      <div><span>Datum</span><strong>{formatMailDate(headerValue(message, "Date"))}</strong></div>
    </div>
    {sanitizedHtml ? <div className="mail-html" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(sanitizedHtml, { USE_PROFILES: { html: true } }) }} /> : <p className="mail-snippet">{message.snippet || "Kein Nachrichtentext verfügbar."}</p>}
    {attachments.length > 0 && <div className="mail-attachments"><strong>Anhänge</strong><div>{attachments.map((attachment, index) => <button key={`${attachment.filename}-${index}`} className="btn ghost small" onClick={() => void onAttachment(attachment)} disabled={busy}><i className="fa-solid fa-paperclip" aria-hidden /> {attachment.filename}</button>)}</div></div>}
  </article>;
}