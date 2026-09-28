import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { createCategory, listCategories } from "@/db/categories";
import { requireAdminApi } from "@/lib/auth/admin";
import { isReservedSlug, isValidSlug } from "@/lib/reservedSlugs";
import { slugify } from "@/lib/slug";

// Adds a section (parentId null) or a subsection. The slug is derived
// from the name, checked against the reserved route names and the whole
// table (slugs are unique across sections and subsections), and the
// change is live on the next request: the in-process cache is dropped
// and every page under the root layout is revalidated.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { name?: unknown; parentId?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const parentId = typeof body?.parentId === "number" && Number.isInteger(body.parentId) ? body.parentId : null;
  if (name.length < 2) return NextResponse.json({ error: "Give it a name (at least 2 characters)." }, { status: 400 });

  const slug = slugify(name);
  if (!isValidSlug(slug)) return NextResponse.json({ error: "That name doesn't make a usable URL. Try letters and numbers." }, { status: 400 });
  if (isReservedSlug(slug, parentId === null ? "top" : "second") || (parentId === null && isReservedSlug(slug, "second"))) {
    return NextResponse.json({ error: `"${slug}" is a reserved address on the site. Choose another name.` }, { status: 400 });
  }
  const all = await listCategories();
  if (all.some((c) => c.slug === slug)) return NextResponse.json({ error: `"${slug}" already exists.` }, { status: 409 });
  const parent = parentId === null ? null : all.find((c) => c.id === parentId && c.parentId === null);
  if (parentId !== null && !parent) return NextResponse.json({ error: "Choose a section for the subsection." }, { status: 400 });

  const created = await createCategory({ slug, name, parentId, template: parent?.template ?? "service" });
  await logAudit({ actorUserId: auth.session.userId, action: "category.created", targetTable: "categories", targetId: created.id, after: { slug, name, parentId } });
  revalidatePath("/", "layout");
  return NextResponse.json({ category: created }, { status: 201 });
}
