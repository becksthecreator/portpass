import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { saveBackupHeartbeat } from "@/db/adminHealth";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

export const dynamic = "force-dynamic";

const limited = createRateLimiter(12, 60 * 60_000);

const digest = (value: string) => createHash("sha256").update(value).digest();

// The backup machine reports in here after each nightly backup, so Admin ->
// Overview can show when the last one ran (brief 08, 1.1). It carries a
// shared secret (BACKUP_HEARTBEAT_SECRET); without one set, nothing is
// accepted. The call says only "a backup finished" or "a backup failed":
// no data about the backup or the database travels with it.
export async function POST(request: Request) {
  const secret = process.env.BACKUP_HEARTBEAT_SECRET;
  if (!secret) return NextResponse.json({ error: "Not set up." }, { status: 503 });
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many calls." }, { status: 429 });
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Compared as digests so the lengths always match and the comparison takes the same time.
  if (!given || !timingSafeEqual(digest(given), digest(secret))) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ok?: unknown } | null;
  try {
    await saveBackupHeartbeat(body?.ok !== false);
  } catch (error) {
    console.error("backup heartbeat", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
