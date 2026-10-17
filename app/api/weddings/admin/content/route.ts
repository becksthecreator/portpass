import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/body";
import { currentWeddingStaffAccount } from "@/app/weddings/staff-auth";
import { getWeddingSiteSettings, updateWeddingSiteSettings } from "@/db/weddingSite";
import { SiteContentBody, siteContentFromBody } from "@/lib/weddingSiteContent";

// The Wedding Desk's content screen: the trust numbers and the WeddingWire
// widgets. Only structured values are accepted (lib/weddingSiteContent.ts):
// the widgets are a member ID and three yes/no switches, and the page builds
// them from that (lib/weddingWire.ts). A body carrying HTML, or any other
// field, is refused. Every save is in the audit log with the account that
// made it.
export async function POST(request: Request) {
  const staff = await currentWeddingStaffAccount();
  if (!staff) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const read = await readJson(request, SiteContentBody, "Check the numbers, the award years and the WeddingWire member ID, then save again.");
  if (!read.ok) return read.response;
  const content = siteContentFromBody(read.value);
  if (!content) return NextResponse.json({ error: "Enter the WeddingWire member ID to show its badges or reviews." }, { status: 400 });

  try {
    await updateWeddingSiteSettings(content, `desk:${staff}`);
    return NextResponse.json({ settings: await getWeddingSiteSettings() });
  } catch (error) {
    console.error("Wedding site settings save error", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not save site content." }, { status: 500 });
  }
}
