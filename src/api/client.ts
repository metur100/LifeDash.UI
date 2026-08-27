const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:5080").replace(/\/$/, "");
const TOKEN_KEY = "lifedash.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked - session only */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("lifedash:signed-out"));
    throw new ApiError(401, "Die Sitzung ist abgelaufen. Bitte melde dich erneut an.");
  }
  if (!res.ok) {
    let message = `Anfrage fehlgeschlagen (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      else if (body?.title) message = body.title;
    } catch { /* keep default */ }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get:  <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put:  <T>(p: string, body: unknown) => request<T>(p, { method: "PUT", body: JSON.stringify(body) }),
  del:  (p: string) => request<void>(p, { method: "DELETE" }),
  upload: <T>(p: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>(p, { method: "POST", body: fd });
  },
  fileUrl: (documentId: number) => `${BASE}/api/documents/${documentId}/file`,
};
