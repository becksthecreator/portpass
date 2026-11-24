import { NextResponse } from "next/server";
import { futprepClassCalendar } from "@/db/futprepCalendar";
import { buildIcs } from "@/lib/ics";

// "Add all 10 to my calendar" (register V4): a listed class's term as a
// calendar file. No personal data in it (lib/ics.ts), so no token. The
// last part of the address may end in ".ics" for calendar apps that want it.
export async function GET(_request: Request, context: { params: Promise<{ program: string; term: string }> }) {
  const { program, term } = await context.params;
  const termId = Number(String(term).replace(/\.ics$/i, ""));
  try {
    const calendar = await futprepClassCalendar(String(program), termId);
    if (!calendar || calendar.sessions.length === 0) return NextResponse.json({ error: "No calendar for that class." }, { status: 404 });
    return new NextResponse(buildIcs(calendar), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="futprep-${program}-${termId}.ics"`,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("futprep calendar error", (error as { code?: string } | null)?.code ?? "");
    return NextResponse.json({ error: "The calendar isn't available right now." }, { status: 503 });
  }
}
