import { NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { saveBackupHeartbeat } from "@/db/adminHealth";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { logRefusedUnset } from "@/lib/env";
import { bearerToken, secretsMatch } from "@/lib/sharedSecret";

export const dynamic = "force-dynamic";

const limited = createRateLimiter(12, 60 * 60_000);

// The backup machine reports in here after each nightly backup, so Admin ->
// Overview can show when the last one ran (brief 08, 1.1). It carries a
// shared secret (BACKUP_HEARTBEAT_SECRET); without one set, nothing is
// accepted (503, and the log names the setting). The call says only "a
// backup finished" or "a backup failed": no data about the backup or the
// database travels with it.
// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["ok"]);

export async function POST(request: Request) {
  const secret = process.env.BACKUP_HEARTBEAT_SECRET?.trim();
  if (!secret) {
    logRefusedUnset("BACKUP_HEARTBEAT_SECRET", "/api/heartbeat/backup");
    return NextResponse.json({ error: "Not set up." }, { status: 503 });
  }
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many calls." }, { status: 429 });
  if (!secretsMatch(bearerToken(request), secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  // It must say plainly whether the backup worked: a body that can't be
  // read is refused, never taken as "it worked".
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: { ok?: unknown } | null = read.value;
  if (typeof body?.ok !== "boolean") return NextResponse.json({ error: "Say whether the backup worked." }, { status: 400 });
  try {
    await saveBackupHeartbeat(body.ok);
  } catch (error) {
    console.error("backup heartbeat", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
