import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug, listBusinessImages } from "@/db/business";
import { getDrop, getShop, listDropReservations, listProducts, listWaitlist } from "@/db/shop";
import { requireOrgRole } from "@/lib/auth/guards";
import { canEditShop } from "@/lib/shop/access";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { dropPhase, dropShareLinks, formatNassau, variantKey } from "@/lib/shop/rules";
import { DropEditor } from "./DropEditor";
import { ReservationBoard } from "./ReservationBoard";
import "@/app/shop/shop.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Drop | Shop | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const PHASE_LABEL = { draft: "Draft (hidden)", upcoming: "Coming up", followers: "Followers first", open: "Open", closed: "Closed" } as const;

// The seller's list for one drop (brief 15, §3): every reservation with
// Paid and Collected buttons, a WhatsApp link, filters, the "Release now?"
// confirm for unpaid holds, the exports and the numbers. /drops/new is the
// blank drop form.
export default async function DropListPage({ params }: { params: Promise<{ slug: string; dropId: string }> }) {
  const { slug, dropId } = await params;
  const creating = dropId === "new";
  const access = await requireOrgRole({ slug }, creating ? "org_admin" : "org_staff", `/business/${slug}/shop/drops/${dropId}`);
  const business = await getBusinessBySlug(slug);
  if (!business || !(await getShop(business.id))) notFound();
  const canEdit = canEditShop(access);

  if (creating) {
    if (!canEdit) notFound();
    const [products, images] = await Promise.all([listProducts(business.id), listBusinessImages(business.id)]);
    const photos = Array.from(new Set([...products.flatMap((p) => p.photos), ...images.map((i) => i.url)]));
    return (
      <main className="form-page auth-page theme-night seller-page">
        <SiteHeader breadcrumb={[{ label: "Shop", href: `/business/${slug}/shop` }, { label: "New drop", href: `/business/${slug}/shop/drops/new` }]} />
        <div className="seller-wrap">
          <div className="eyebrow"><span className="eyebrow-dot" />Shop · Drop</div>
          <h1 className="seller-title">New drop</h1>
          <DropEditor orgId={business.id} slug={slug} drop={null} products={products.map((p) => ({ id: p.id, title: p.title, isPublished: p.isPublished }))} photos={photos} />
        </div>
        <SiteFooter />
      </main>
    );
  }

  const id = Number(dropId);
  const drop = Number.isInteger(id) && id > 0 ? await getDrop(business.id, id) : null;
  if (!drop) notFound();
  const [reservations, waitlist, products, shop] = await Promise.all([listDropReservations(business.id, drop.id), listWaitlist(business.id, drop.id), listProducts(business.id), getShop(business.id)]);
  const sizes = products
    .filter((p) => drop.productIds.includes(p.id))
    .flatMap((p) => p.variants.map((v) => ({ key: variantKey({ productId: p.id, label: v.label }), label: `${p.title} · ${v.label}`, stock: v.stock })));
  const links = dropShareLinks("https://portpassbahamas.com", slug, drop.slug, drop.followersToken);
  const phase = dropPhase(drop);

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: "Shop", href: `/business/${slug}/shop` }, { label: drop.title, href: `/business/${slug}/shop/drops/${drop.id}` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />{PHASE_LABEL[phase]}</div>
        <h1 className="seller-title">{drop.title}</h1>
        <p className="seller-note">
          Opens {formatNassau(drop.opensAt)}{drop.followersFirstUntil ? ` for followers, ${formatNassau(drop.followersFirstUntil)} for everyone` : ""}{drop.closesAt ? ` · closes ${formatNassau(drop.closesAt)}` : ""}
        </p>
        <p className="seller-links">
          {drop.status !== "draft" && <a href={`/shop/${slug}/drop/${drop.slug}`}>Drop page</a>}
          {canEdit && <Link href={`/business/${slug}/shop/drops/${drop.id}/edit`}>Edit drop</Link>}
        </p>
        <ReservationBoard
          orgId={business.id}
          orgName={business.name}
          dropId={drop.id}
          holdHours={shop?.holdHours ?? 48}
          canRefund={canEdit}
          initial={reservations}
          waitlist={waitlist}
          sizes={sizes}
          requestPaymentHref={(await handlesPayments(access)) ? `/business/${slug}/payments/new?reservation=` : null}
          links={drop.status === "draft" ? null : { portpass: links.portpass, instagram: links.instagram, followers: drop.followersFirstUntil ? links.followers : null }}
        />
      </div>
      <SiteFooter />
    </main>
  );
}
