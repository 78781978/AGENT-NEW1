import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type Profile = {
  id: string;
  name: string | null;
  preferences: Record<string, string>;
};

async function getProfile(userId: string, accessToken: string) {
  const rows = await supabaseRequest<Profile[]>(
    `user_profiles?select=id,name,preferences&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {},
    accessToken,
  );

  return rows[0] ?? null;
}

async function upsertProfile(
  accessToken: string,
  name: string | null,
  preferences: Record<string, string>,
) {
  const rows = await supabaseRequest<Profile[]>(
    "rpc/upsert_current_user_profile",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        profile_name: name,
        profile_preferences: preferences,
      }),
    },
    accessToken,
  );

  return rows[0] ?? null;
}

function profileStatus(error: unknown) {
  return error instanceof Error && /zalog|sesja|jwt|token|pgrst303/i.test(error.message)
    ? 401
    : 500;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const profile = await getProfile(user.id, user.accessToken);

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd profilu" },
      { status: profileStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const existingProfile = await getProfile(user.id, user.accessToken);

    if (existingProfile) {
      return NextResponse.json({ profile: existingProfile });
    }

    const profile = await upsertProfile(user.accessToken, user.email?.split("@")[0] ?? null, {});

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd profilu" },
      { status: profileStatus(error) },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as {
      name?: string;
      preference?: { key: string; value: string };
    };
    const currentProfile = (await getProfile(user.id, user.accessToken)) ?? {
      id: user.id,
      name: null,
      preferences: {},
    };
    const preferences = { ...(currentProfile.preferences ?? {}) };

    if (body.preference?.key && body.preference.value) {
      preferences[body.preference.key] = body.preference.value;
    }

    const profile = await upsertProfile(
      user.accessToken,
      body.name ?? currentProfile.name ?? user.email?.split("@")[0] ?? null,
      preferences,
    );

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd profilu" },
      { status: profileStatus(error) },
    );
  }
}
