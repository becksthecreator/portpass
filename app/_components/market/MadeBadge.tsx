import { MADE_IN_BAHAMAS } from "@/lib/market/sellers";
import "./market-cards.css";

// "Made in The Bahamas" (brief 25, A2): a verified seller's badge, on its
// storefront, every one of its product cards, its product pages and the
// Market. Decorative motion: none.
export function MadeBadge({ variant = "card", as = "span" }: { variant?: "card" | "hero" | "inline"; as?: "span" | "p" }) {
  const Tag = as;
  return <Tag className={`mib-badge mib-badge-${variant}`}>{MADE_IN_BAHAMAS}</Tag>;
}
