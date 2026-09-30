import { resolvePayAccess } from "@/app/futprep/staff/pay/access";
import { listPayLedger } from "@/db/coachPay";
import { payCsv } from "@/lib/coachPay";

// Coach pay as CSV (brief 13): everyone's for Alex and platform owners, a
// coach's own for a coach. No child data.
export async function GET() {
  const access = await resolvePayAccess();
  if (!access) return new Response("Sign in again.", { status: 401 });
  if (access.kind === "own" && !access.coach) return new Response("No coach profile is linked to this login yet.", { status: 404 });
  const rows = await listPayLedger(access.kind === "own" ? { coachId: access.coach!.id } : {});
  return new Response(payCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="futprep-coach-pay-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
