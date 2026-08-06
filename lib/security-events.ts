import {
  getSecurityStats,
  recordSecurityEvent,
  type SecurityEvent,
  type SecurityEventType,
} from "./security";
import { supabaseRequest } from "./supabase";

type SecurityEventRow = {
  event_type: SecurityEventType;
  created_at: string;
};

export async function recordUserSecurityEvent(userId: string, type: SecurityEventType) {
  recordSecurityEvent(type);

  await supabaseRequest("security_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      event_type: type,
    }),
  }).catch((error) => {
    console.error("Nie udało się zapisać zdarzenia bezpieczeństwa:", error);
  });
}

export async function getUserSecurityStats(userId: string) {
  const rows = await supabaseRequest<SecurityEventRow[]>(
    [
      "security_events?select=event_type,created_at",
      `user_id=eq.${encodeURIComponent(userId)}`,
      "order=created_at.desc",
      "limit=200",
    ].join("&"),
  ).catch(() => []);

  const events: SecurityEvent[] = rows.map((row) => ({
    type: row.event_type,
    createdAt: row.created_at,
  }));

  return getSecurityStats(events);
}
