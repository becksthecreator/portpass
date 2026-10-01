import { NextResponse } from "next/server";
import { createDraftBusiness } from "@/db/business";
import { listSections } from "@/db/categories";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";

// Admin actions are rate-limited per founder (brief 08, security rules).
const limited = createRateLimiter(30, 10 * 60_000);

// Admin -> Businesses: "Add a business" (brief 08, 1.2, concierge). A
// founder creates the draft for an owner, fills it in with the same setup
// wizard, then publishes it on the owner's word or sends a claim link.
// The business starts as an unpublished draft with no owner.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { name?: unknown; section?: unknown; subcategory?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name.length < 2) return NextResponse.json({ error: "Enter the business name." }, { status: 400 });

  const sections = await listSections({ includeHidden: true });
  const section = sections.find((s) => s.slug === body?.section);
  if (!section) return NextResponse.json({ error: "Choose a section." }, { status: 400 });
  const subcategory = section.subcategories.find((c) => c.slug === body?.subcategory) ?? null;

  try {
    const business = await createDraftBusiness({ name, section: section.slug, subcategory: subcategory?.slug ?? null, ownerUserId: null, createdByAdmin: true, actorUserId: auth.session.userId });
    return NextResponse.json({ id: business.id, slug: business.slug }, { status: 201 });
  } catch (error) {
    console.error("admin add business", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not add the business." }, { status: 500 });
  }
}
