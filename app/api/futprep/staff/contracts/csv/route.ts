import { currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { listContractLines } from "@/db/coachPay";
import { contractsCsv } from "@/lib/coachPay";

// What to invoice each school (brief 13): sessions delivered × fee, or the
// term fee. No child data. Registration desk and CEO logins.
export async function GET() {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") return new Response("Registration desk or CEO access required.", { status: 403 });
  return new Response(contractsCsv(await listContractLines()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="futprep-school-contracts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
