import "server-only";
import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/auth/rateLimit";

// /order/<code> lookups are rate-limited per visitor (brief 25, C3): the
// order code is the only key, so nobody may try codes at speed.
const limited = createRateLimiter(30, 60_000);

export async function orderLookupAllowed(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return !limited(`order|${ip}`);
}

// The code must not travel in a Referer to the seller's WhatsApp, website
// or anywhere else a buyer taps through to, and the page is never indexed.
export const ORDER_PAGE_METADATA = {
  title: "Your order | PortPass Market",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer" as const,
};
