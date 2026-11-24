import { NextResponse } from "next/server";
import { getFutprepAvailability } from "@/db/registrations";
import { placesLeft } from "@/lib/futprepPlaces";

// Places left in each open class, for the register's live count (V4).
// Counts only (lib/futprepPlaces.ts). Cached for 30 seconds at the edge, so
// a page polling it can't load the database; the registration itself is
// still refused under the class's lock when the last place has gone.
export async function GET() {
  try {
    return NextResponse.json(
      { places: placesLeft(await getFutprepAvailability()) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error) {
    console.error("futprep places error", (error as { code?: string } | null)?.code ?? "");
    return NextResponse.json({ error: "Places left aren't available right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
