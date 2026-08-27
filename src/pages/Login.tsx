import { useEffect, useRef, useState } from "react";
import { useAuth } from "../components/AuthContext";
import { ErrorBar } from "../components/Ui";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (args: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function Login() {
  const { signInGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  useEffect(() => {
    if (!googleClientId || !window.google || !googleRef.current) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (res) => {
        if (!res.credential) return;
        setBusy(true);
        setError(null);
        try {
          await signInGoogle(res.credential);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
    googleRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleRef.current, {
      theme: "outline",
      size: "large",
      width: 240,
      text: "signin_with",
      shape: "pill",
    });
  }, [googleClientId, signInGoogle]);

  return (
    <div className="auth">
      <div className="auth-card">
        <p className="eyebrow">Persönliches Ablagesystem</p>
        <h1 style={{ marginBottom: 18 }}>Life Dashboard</h1>

        <div className="card">
          <ErrorBar message={error} />

          <p className="auth-hint">Google-Konto verbinden, um Life Dashboard zu nutzen.</p>

          {googleClientId && (
            <>
              <div ref={googleRef} className="google-btn-wrap" />
            </>
          )}
          {!googleClientId && <p className="auth-hint">Google Login: setze VITE_GOOGLE_CLIENT_ID im Frontend.</p>}
          {busy && <p className="auth-hint">Anmeldung läuft …</p>}
        </div>
      </div>
    </div>
  );
}
