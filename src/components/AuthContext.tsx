import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, getToken, setToken } from "../api/client";
import type { AuthResponse } from "../api/types";

interface Session { userId: number; email: string; displayName: string; }

interface AuthValue {
  session: Session | null;
  ready: boolean;
  signInGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get<Session>("/api/auth/me")
      .then(setSession)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onOut = () => setSession(null);
    window.addEventListener("lifedash:signed-out", onOut);
    return () => window.removeEventListener("lifedash:signed-out", onOut);
  }, []);

  const apply = (r: AuthResponse) => {
    setToken(r.token);
    setSession({ userId: r.userId, email: r.email, displayName: r.displayName });
  };

  const signInGoogle = useCallback(async (idToken: string) => {
    apply(await api.post<AuthResponse>("/api/auth/google", { idToken }));
  }, []);

  const signOut = useCallback(() => { setToken(null); setSession(null); }, []);

  const value = useMemo(() => ({ session, ready, signInGoogle, signOut }),
    [session, ready, signInGoogle, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
