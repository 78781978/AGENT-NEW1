import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../../lib/supabase";

type SecurityEventRow = {
  event_type: string;
  created_at: string;
};

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  const rows = await supabaseRequest<SecurityEventRow[]>(
    [
      "security_events?select=event_type,created_at",
      `user_id=eq.${encodeURIComponent(user.id)}`,
      "order=created_at.desc",
      "limit=1000",
    ].join("&"),
    {},
    user.accessToken,
  );
  const events = (Array.isArray(rows) ? rows : []).map((row) => ({
    type: String(row.event_type).trim().toLowerCase(),
    createdAt: row.created_at,
  }));
  const count = (type: string) =>
    events.reduce((total, event) => total + (event.type === type ? 1 : 0), 0);
  const blockedInputs = count("blocked_input");
  const filteredOutputs = count("filtered_output");
  const rateLimited = count("rate_limited");
  const tokenLimited = count("token_limited");

  return NextResponse.json({
    ok: true,
    stats: {
      acceptedMessages: count("accepted_message"),
      blockedInputs,
      filteredOutputs,
      rateLimited,
      tokenLimited,
      abuseAttempts: blockedInputs + filteredOutputs + rateLimited + tokenLimited,
      recentEvents: events.slice(0, 8),
    },
  });
}
