import { NextResponse } from "next/server";
import { getBusiness, listBusinessImages, listBusinessOfferings, listInvites, listTeam, updateBusinessDetails, type BusinessDetailsPatch } from "@/db/business";
import { getCategoryBySlug, getSectionWithSubcategories } from "@/db/categories";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { normalizePhoneE164 } from "@/lib/phone";

type Ctx = { params: Promise<{ id: string }> };

async function orgId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function str(body: Record<string, unknown>, key: string, max: number): string | undefined {
  if (!(key in body)) return undefined;
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// Everything the wizard needs to hydrate, in one call.
export async function GET(_request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_viewer");
  if (!auth.ok) return auth.response;

  const business = await getBusiness(id);
  if (!business) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [images, offerings, invites, team, section] = await Promise.all([
    listBusinessImages(id),
    listBusinessOfferings(id),
    listInvites(id),
    listTeam(id),
    business.primaryCategory ? getSectionWithSubcategories(business.primaryCategory) : Promise.resolve(null),
  ]);
  return NextResponse.json({ business, images, offerings, invites, team, section, role: auth.membership?.role ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step saves. Every field is optional; only what's present is validated
// and written, so a step can save exactly what's on it.
export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const patch: BusinessDetailsPatch = {};
  const name = str(body, "name", 150);
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: "The business needs a name." }, { status: 400 });
    patch.name = name;
  }
  const subcategory = str(body, "subcategory", 60);
  if (subcategory !== undefined) {
    if (subcategory) {
      const cat = await getCategoryBySlug(subcategory).catch(() => null);
      const business = await getBusiness(id);
      const parent = business?.primaryCategory ? await getCategoryBySlug(business.primaryCategory) : null;
      if (!cat || !parent || cat.parentId !== parent.id) return NextResponse.json({ error: "Choose a subcategory from your section." }, { status: 400 });
    }
    patch.subcategory = subcategory || null;
  }
  const oneLiner = str(body, "oneLiner", 200);
  if (oneLiner !== undefined) {
    if (oneLiner.length > 120) return NextResponse.json({ error: "Keep the one-liner to 120 characters." }, { status: 400 });
    patch.oneLiner = oneLiner || null;
  }
  for (const key of ["island", "area"] as const) {
    const v = str(body, key, 80);
    if (v !== undefined) patch[key] = v || null;
  }
  const description = str(body, "description", 2000);
  if (description !== undefined) patch.description = description || null;
  for (const key of ["phoneE164", "whatsappE164"] as const) {
    const v = str(body, key, 40);
    if (v !== undefined) {
      if (!v) patch[key] = null;
      else {
        const e164 = normalizePhoneE164(v);
        if (!e164) return NextResponse.json({ error: "Enter a phone number we can dial, like 423-8161 or +1 242 423 8161." }, { status: 400 });
        patch[key] = e164;
      }
    }
  }
  const publicEmail = str(body, "publicEmail", 254);
  if (publicEmail !== undefined) {
    if (publicEmail && !EMAIL_PATTERN.test(publicEmail)) return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
    patch.publicEmail = publicEmail.toLowerCase() || null;
  }
  const websiteUrl = str(body, "websiteUrl", 300);
  if (websiteUrl !== undefined) {
    const normalised = websiteUrl && !/^https?:\/\//i.test(websiteUrl) ? `https://${websiteUrl}` : websiteUrl;
    if (normalised && !URL_PATTERN.test(normalised)) return NextResponse.json({ error: "That website address doesn't look right." }, { status: 400 });
    patch.websiteUrl = normalised || null;
  }
  const instagram = str(body, "instagramHandle", 120);
  if (instagram !== undefined) {
    const handle = instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return NextResponse.json({ error: "Instagram: just the username, like @yourbusiness." }, { status: 400 });
    patch.instagramHandle = handle || null;
  }
  const brandColor = str(body, "brandColor", 7);
  if (brandColor !== undefined) {
    if (brandColor && !/^#[0-9a-f]{6}$/i.test(brandColor)) return NextResponse.json({ error: "Brand colour must be a 6-digit hex code." }, { status: 400 });
    patch.brandColor = brandColor ? brandColor.toLowerCase() : null;
  }
  const ownerName = str(body, "ownerName", 120);
  if (ownerName !== undefined) patch.ownerName = ownerName || null;
  const ownerBio = str(body, "ownerBio", 1200);
  if (ownerBio !== undefined) patch.ownerBio = ownerBio || null;

  try {
    const business = await updateBusinessDetails(id, patch, auth.session.userId);
    return NextResponse.json({ business });
  } catch (error) {
    if (error instanceof Error && error.message === "SUSPENDED") return NextResponse.json({ error: "This page is hidden by PortPass, so its name and category can't change right now. Message us and we'll sort it out." }, { status: 409 });
    console.error("business details save", error);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}
