import { NextResponse } from "next/server";
import { getUserSecurityStats } from "../../../../lib/security-events";
import { getAuthenticatedUser } from "../../../../lib/supabase";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);

  return NextResponse.json({
    ok: true,
    stats: await getUserSecurityStats(user.id),
  });
}
