import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { resetDemoBusiness } from "@/db/demo";
import { requirePlatformRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";

const limited = createRateLimiter(10, 10 * 60_000);

// "Reset demo" (brief 18, part B): PortPass platform owners put the demo
// business back to its starting point. A real account with the platform
// owner role, never a demo session. Logged (with no business on the line:
// the demo itself is kept out of the audit trail).
export async function POST() {
  const auth = await requirePlatformRoleApi("platform_owner");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many resets in a row. Wait a few minutes." }, { status: 429 });
  try {
    await resetDemoBusiness();
    await logAudit({ actorUserId: auth.session.userId, action: "demo.reset", targetTable: "organizations" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("demo reset", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "The demo could not be reset." }, { status: 500 });
  }
}
