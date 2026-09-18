import { NextResponse } from "next/server";
import { getFutprepAvailability } from "@/db/registrations";

export async function GET() {
  try {
    return NextResponse.json({ availability: await getFutprepAvailability() });
  } catch (error) {
    console.error("Futprep availability error", error);
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 500 });
  }
}
