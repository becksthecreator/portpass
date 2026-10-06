import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug, listBusinessImages } from "@/db/business";
import { getProduct, getShop } from "@/db/shop";
import { requireOrgRole } from "@/lib/auth/guards";
import { canEditShop } from "@/lib/shop/access";
import { ProductEditor } from "./ProductEditor";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Product | Shop | PortPass Bahamas",
  robots: { index: false, follow: false },
};

export default async function ProductPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;
  const access = await requireOrgRole({ slug }, "org_admin", `/business/${slug}/shop/products/${productId}`);
  if (!canEditShop(access)) notFound();
  const business = await getBusinessBySlug(slug);
  const shop = business ? await getShop(business.id) : null;
  if (!business || !shop) notFound();
  const id = productId === "new" ? null : Number(productId);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) notFound();
  const [product, images] = await Promise.all([id === null ? Promise.resolve(null) : getProduct(business.id, id), listBusinessImages(business.id)]);
  if (id !== null && !product) notFound();

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: "Shop", href: `/business/${slug}/shop` }, { label: product?.title ?? "New product", href: `/business/${slug}/shop/products/${productId}` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />Shop · Product</div>
        <h1 className="seller-title">{product?.title ?? "New product"}</h1>
        <ProductEditor orgId={business.id} slug={slug} product={product} listingPhotos={images.map((i) => i.url)} defaultCategory={shop.marketCategory} />
      </div>
      <SiteFooter />
    </main>
  );
}
