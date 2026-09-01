import { NextResponse } from "next/server";
import { createApplication } from "@/db/applications";

function text(body: Record<string, unknown>, key: string, max = 1500) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const values = {
    organization_name: text(body, "organizationName", 150),
    contact_person: text(body, "contactPerson", 120),
    email: text(body, "email", 180),
    phone: text(body, "phone", 50),
    activity_type: text(body, "activityType", 120),
    main_location: text(body, "mainLocation", 180),
    player_count: text(body, "playerCount", 80),
    help_needed: text(body, "helpNeeded"),
    description: text(body, "description"),
  };

  if (Object.values(values).some((value) => !value)) {
    return NextResponse.json({ error: "Complete all required fields." }, { status: 400 });
  }

  await createApplication(values);
  return NextResponse.json({ ok: true }, { status: 201 });
}
