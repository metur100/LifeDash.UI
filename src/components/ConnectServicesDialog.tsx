import { useEffect, useState } from "react";
import { ErrorBar } from "./Ui";
import { useAuth } from "./AuthContext";

const DRIVE_TOKEN_KEY = "ld_drive_access_token";
const DRIVE_TOKEN_EXP_KEY = "ld_drive_access_token_expires";
const DRIVE_LINKED_KEY = "ld_drive_linked";
const GMAIL_TOKEN_KEY = "ld_gmail_access_token";
const GMAIL_TOKEN_EXP_KEY = "ld_gmail_access_token_expires";
const GMAIL_TOKEN_SCOPE_VERSION_KEY = "ld_gmail_access_token_scope_version";
const GMAIL_SCOPE_VERSION = "2";
const PROMPT_DISMISSED_KEY = "ld_connect_prompt_dismissed";

// Single consent that covers both Drive and Gmail scopes so Documents.tsx/Mail.tsx pick up the token unattended.
const COMBINED_SCOPE = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

type GoogleWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          include_granted_scopes?: boolean;
          callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void;
        }) => { requestAccessToken: (opts: { prompt: string }) => void };
      };
    };
  };
};

function alreadyConnected() {
  const driveExp = Number(localStorage.getItem(DRIVE_TOKEN_EXP_KEY) ?? "0");
  const gmailExp = Number(localStorage.getItem(GMAIL_TOKEN_EXP_KEY) ?? "0");
  return (!!localStorage.getItem(DRIVE_TOKEN_KEY) && driveExp > Date.now())
    || (!!localStorage.getItem(GMAIL_TOKEN_KEY) && gmailExp > Date.now());
}

export default function ConnectServicesDialog() {
  const { session } = useAuth();
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !googleClientId) return;
    if (sessionStorage.getItem(PROMPT_DISMISSED_KEY) === "1") return;
    if (alreadyConnected()) return;
    setOpen(true);
  }, [session, googleClientId]);

  function dismiss() {
    sessionStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const g = (window as GoogleWindow).google;
      if (!g?.accounts?.oauth2) throw new Error("Google-Dienste sind noch nicht geladen. Bitte versuche es gleich erneut.");
      await new Promise<void>((resolve, reject) => {
        const client = g.accounts!.oauth2!.initTokenClient({
          client_id: googleClientId!,
          scope: COMBINED_SCOPE,
          include_granted_scopes: true,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Verbindung fehlgeschlagen."));
              return;
            }
            const expAt = Date.now() + Math.max(60, Number(resp.expires_in ?? 3600)) * 1000;
            localStorage.setItem(DRIVE_TOKEN_KEY, resp.access_token);
            localStorage.setItem(DRIVE_TOKEN_EXP_KEY, String(expAt));
            localStorage.setItem(DRIVE_LINKED_KEY, "1");
            localStorage.setItem(GMAIL_TOKEN_KEY, resp.access_token);
            localStorage.setItem(GMAIL_TOKEN_EXP_KEY, String(expAt));
            localStorage.setItem(GMAIL_TOKEN_SCOPE_VERSION_KEY, GMAIL_SCOPE_VERSION);
            resolve();
          },
        });
        client.requestAccessToken({ prompt: "" });
      });
      dismiss();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dlg-backdrop" role="presentation">
      <div className="dlg" role="dialog" aria-modal="true">
        <div className="dlg-head">
          <h3>Google Drive &amp; Gmail verbinden</h3>
        </div>
        <p className="dlg-text">Ein Klick verbindet Google Drive und Gmail mit diesem Konto.</p>
        <ErrorBar message={error} />
        <div className="dlg-actions">
          <button className="btn" onClick={connect} disabled={busy}>
            {busy ? "Verbinde …" : "Mit Google-Konto verbinden"}
          </button>
        </div>
      </div>
    </div>
  );
}
