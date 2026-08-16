import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const cookieName = "sb-access-token";
const refreshCookieName = "sb-refresh-token";

export type SupabaseUser = {
  id: string;
  email?: string;
  accessToken: string;
};

function requireSupabaseConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brakuje konfiguracji Supabase w .env.local.");
  }
}

function authHeaderFromRequest(request?: Request) {
  const header = request?.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header;
  }

  const cookieHeader = request?.headers.get("cookie") ?? "";
  const cookieToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`))
    ?.split("=")[1];

  if (cookieToken) {
    return `Bearer ${decodeURIComponent(cookieToken)}`;
  }

  return undefined;
}

function cookieValue(request: Request | undefined, name: string) {
  return (request?.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function refreshAccessToken(request?: Request) {
  const cookieStore = await cookies();
  const encodedRefreshToken = cookieValue(request, refreshCookieName) ?? cookieStore.get(refreshCookieName)?.value;
  if (!encodedRefreshToken) return undefined;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: supabaseKey!, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: decodeURIComponent(encodedRefreshToken) }),
  });
  if (!response.ok) return undefined;

  const session = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!session.access_token) return undefined;

  cookieStore.set(cookieName, session.access_token, {
    path: "/", maxAge: 604800, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  if (session.refresh_token) {
    cookieStore.set(refreshCookieName, session.refresh_token, {
      path: "/", maxAge: 2592000, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    });
  }
  return `Bearer ${session.access_token}`;
}

export async function getAuthenticatedUser(request?: Request): Promise<SupabaseUser> {
  requireSupabaseConfig();

  let authorization = authHeaderFromRequest(request);

  if (!authorization && !request) {
    const cookieStore = await cookies();
    const token = cookieStore.get(cookieName)?.value;
    authorization = token ? `Bearer ${token}` : undefined;
  }

  if (!authorization) {
    throw new Error("Musisz się zalogować.");
  }

  let response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    cache: "no-store",
    headers: {
      apikey: supabaseKey!,
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    authorization = await refreshAccessToken(request);
    if (!authorization) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      cache: "no-store",
      headers: { apikey: supabaseKey!, Authorization: authorization },
    });
    if (!response.ok) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }

  const user = (await response.json()) as Omit<SupabaseUser, "accessToken">;
  if (!user.id) {
    throw new Error("Nie udało się rozpoznać użytkownika.");
  }

  return {
    ...user,
    accessToken: authorization.replace(/^Bearer\s+/i, ""),
  };
}

export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  requireSupabaseConfig();
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;
  const apiKey = accessToken ? supabaseKey : serverKey;

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: apiKey!,
      Authorization: `Bearer ${accessToken || serverKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}
