import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type BriefingRow = {
  id: string;
  created_at: string;
  content: string;
  date: string;
  metadata: Record<string, unknown>;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const briefings = await supabaseRequest<BriefingRow[]>(
      "briefings?select=id,created_at,content,date,metadata&order=created_at.desc&limit=30",
      {
        headers: {
          Accept: "application/json",
        },
      },
      user.accessToken,
    );

    return NextResponse.json({
      ok: true,
      briefings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Nie udało się pobrać briefingów.",
      },
      { status: 500 },
    );
  }
}
