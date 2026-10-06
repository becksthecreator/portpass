import Link from "next/link";
import { formatPriceCents } from "@/app/_components/blocks/format";
import type { MarketProduct } from "@/db/market";
import { productHref } from "@/lib/market/browse";
import { MadeBadge } from "./MadeBadge";
import "./market-cards.css";

// One product on PortPass Market (brief 25, part B): /market, a category,
// and the homepage's "From the Market" strip. The whole card is the link
// to the product page; the badge says the seller is verified.
export function MarketProductCard({ product, eager = false }: { product: MarketProduct; eager?: boolean }) {
  const photo = product.photos[0] ?? null;
  return (
    <Link className="mkt-card" href={productHref(product.sellerSlug, product.slug)}>
      <span className="mkt-card-photo">
        {photo ? <img src={photo} alt="" loading={eager ? "eager" : "lazy"} decoding="async" /> : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
        <MadeBadge />
      </span>
      <span className="mkt-card-body">
        <strong>{product.title}</strong>
        <span className="mkt-card-price">{formatPriceCents(product.priceCents)}</span>
        <span className="mkt-card-seller">{product.sellerName}</span>
      </span>
    </Link>
  );
}
