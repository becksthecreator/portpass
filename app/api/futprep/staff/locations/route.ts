import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { createFutprepLocation, listFutprepLocations, setFutprepLocationActive, updateFutprepLocation } from "@/db/futprepLocations";
import { bodyOf, readJson } from "@/lib/api/body";
import { parseLocationInput } from "@/lib/futprepLocations";
import { roleCan } from "@/lib/futprepRoles";

// Futprep's places and what each costs (brief 31, B1). The CEO and admin
// logins only (lib/futprepRoles.ts "locations"); every change is
// audit-logged. A place is switched off, never deleted.
const FIELDS = ["name", "area", "address", "costModel", "cost", "costNote", "surface", "privateSessionsOk", "daysAvailable", "hoursNote"] as const;
const PostBody = bodyOf(FIELDS);
const PatchBody = bodyOf(["id", "active", ...FIELDS]);

async function manager() {
  const role = await currentFutprepStaffRole();
  if (!role) return { error: NextResponse.json({ error: "Sign in again." }, { status: 401 }) };
  if (!roleCan(role, "locations")) return { error: NextResponse.json({ error: "Only an admin or the CEO can change locations." }, { status: 403 }) };
  return { actor: (await currentFutprepStaffName()) ?? role };
}

export async function POST(request: Request) {
  const who = await manager();
  if ("error" in who) return who.error;
  const read = await readJson(request, PostBody);
  if (!read.ok) return read.response;
  const parsed = parseLocationInput(read.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    await createFutprepLocation(parsed.value, who.actor);
    return NextResponse.json({ ok: true, locations: await listFutprepLocations() });
  } catch (error) {
    if (error instanceof Error && error.message === "NAME_TAKEN") return NextResponse.json({ error: "There's already a place with that name." }, { status: 409 });
    console.error("Futprep location add error", error);
    return NextResponse.json({ error: "Could not add the location." }, { status: 500 });
  }
}

// Either { id, active } to switch a place on or off, or { id, ...fields }
// to save it.
export async function PATCH(request: Request) {
  const who = await manager();
  if ("error" in who) return who.error;
  const read = await readJson(request, PatchBody);
  if (!read.ok) return read.response;
  const { id: rawId, active, ...fields } = read.value;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    if (active !== undefined) {
      if (typeof active !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      await setFutprepLocationActive(id, active, who.actor);
    } else {
      const parsed = parseLocationInput(fields);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      await updateFutprepLocation(id, parsed.value, who.actor);
    }
    return NextResponse.json({ ok: true, locations: await listFutprepLocations() });
  } catch (error) {
    if (error instanceof Error && error.message === "LOCATION_NOT_FOUND") return NextResponse.json({ error: "Location not found." }, { status: 404 });
    if (error instanceof Error && error.message === "NAME_TAKEN") return NextResponse.json({ error: "There's already a place with that name." }, { status: 409 });
    console.error("Futprep location save error", error);
    return NextResponse.json({ error: "Could not save the location." }, { status: 500 });
  }
}
