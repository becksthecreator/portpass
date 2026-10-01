import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug, listBusinessImages } from "@/db/business";
import { getDrop, getShop, listProducts } from "@/db/shop";
import { requireOrgRole } from "@/lib/auth/guards";
import { canEditShop } from "@/lib/shop/access";
import { DropEditor } from "../DropEditor";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit drop | Shop | PortPass Bahamas",
  robots: { index: false, follow: false },
};

export default async function EditDropPage({ params }: { params: Promise<{ slug: string; dropId: string }> }) {
  const { slug, dropId } = await params;
  const access = await requireOrgRole({ slug }, "org_admin", `/business/${slug}/shop/drops/${dropId}/edit`);
  if (!canEditShop(access)) notFound();
  const business = await getBusinessBySlug(slug);
  if (!business || !(await getShop(business.id))) notFound();
  const id = Number(dropId);
  const drop = Number.isInteger(id) && id > 0 ? await getDrop(business.id, id) : null;
  if (!drop) notFound();
  const [products, images] = await Promise.all([listProducts(business.id), listBusinessImages(business.id)]);
  const photos = Array.from(new Set([...products.flatMap((p) => p.photos), ...images.map((i) => i.url)]));

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: drop.title, href: `/business/${slug}/shop/drops/${drop.id}` }, { label: "Edit", href: `/business/${slug}/shop/drops/${drop.id}/edit` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />Shop · Drop</div>
        <h1 className="seller-title">Edit {drop.title}</h1>
        <DropEditor orgId={business.id} slug={slug} drop={drop} products={products.map((p) => ({ id: p.id, title: p.title, isPublished: p.isPublished }))} photos={photos} />
      </div>
      <SiteFooter />
    </main>
  );
}
