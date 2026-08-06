const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  user: AuthUser;
};

const storageKey = "vie_supabase_session";
const cookieName = "sb-access-token";

function requireConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Brakuje konfiguracji Supabase Auth w .env.local.");
  }
}

function setAuthCookie(token: string) {
  document.cookie = `${cookieName}=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
}

function clearAuthCookie() {
  document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax`;
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(storageKey, JSON.stringify(session));
  setAuthCookie(session.access_token);
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(storageKey);
  clearAuthCookie();
}

async function authFetch<T>(path: string, init: RequestInit = {}) {
  requireConfig();

  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey!,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const json = (await response.json().catch(() => ({}))) as T & { msg?: string; error_description?: string; error?: string };

  if (!response.ok) {
    throw new Error(json.error_description || json.msg || json.error || "Supabase Auth zwrócił błąd.");
  }

  return json as T;
}

export async function signIn(email: string, password: string) {
  const session = await authFetch<AuthSession>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession(session);
  return session;
}

export async function signUp(email: string, password: string) {
  const session = await authFetch<AuthSession>("signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (session.access_token) {
    saveSession(session);
  }

  return session;
}

export async function signOut() {
  const session = getStoredSession();
  if (session?.access_token) {
    await authFetch("logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => undefined);
  }
  clearSession();
}

export async function getCurrentUser() {
  const session = getStoredSession();
  if (!session?.access_token) return null;

  try {
    const user = await authFetch<AuthUser>("user", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    setAuthCookie(session.access_token);
    return user;
  } catch {
    clearSession();
    return null;
  }
}
