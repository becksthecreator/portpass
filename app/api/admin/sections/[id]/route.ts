import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { getCategoryBySlug, invalidateCategoryCache, listCategories, moveCategory, updateCategory, type CategoryPatch } from "@/db/categories";
import { requireAdminApi } from "@/lib/auth/admin";

type Ctx = { params: Promise<{ id: string }> };

// Rename, show/hide, set the coming-soon threshold, or move up/down.
// Rows are never deleted from here: a slug may be referenced by a
// business, and a hidden row costs nothing.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Not found." }, { status: 404 });
  invalidateCategoryCache();
  const before = (await listCategories()).find((c) => c.id === id);
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { name?: unknown; isVisible?: unknown; comingSoonThreshold?: unknown; move?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (body.move === "up" || body.move === "down") {
    const moved = await moveCategory(id, body.move);
    if (moved) await logAudit({ actorUserId: auth.session.userId, action: "category.updated", targetTable: "categories", targetId: id, before: { sortOrder: before.sortOrder }, after: { move: body.move } });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, moved });
  }

  const patch: CategoryPatch = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (name.length < 2) return NextResponse.json({ error: "Give it a name (at least 2 characters)." }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.isVisible === "boolean") patch.isVisible = body.isVisible;
  if (typeof body.comingSoonThreshold === "number") {
    if (!Number.isInteger(body.comingSoonThreshold) || body.comingSoonThreshold < 0 || body.comingSoonThreshold > 50) {
      return NextResponse.json({ error: "The coming-soon threshold is a whole number from 0 to 50." }, { status: 400 });
    }
    patch.comingSoonThreshold = body.comingSoonThreshold;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const after = await updateCategory(id, patch);
  await logAudit({
    actorUserId: auth.session.userId,
    action: "category.updated",
    targetTable: "categories",
    targetId: id,
    before: { name: before.name, isVisible: before.isVisible, comingSoonThreshold: before.comingSoonThreshold },
    after: { name: after.name, isVisible: after.isVisible, comingSoonThreshold: after.comingSoonThreshold },
  });
  revalidatePath("/", "layout");
  // getCategoryBySlug is what the public routes use; a fresh read here is
  // the cheapest proof the change is visible.
  const fresh = await getCategoryBySlug(after.slug);
  return NextResponse.json({ category: fresh ?? after });
}
