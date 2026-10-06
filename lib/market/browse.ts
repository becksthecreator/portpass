// PortPass Market browsing (brief 25, part B): the rules for /market, pure,
// so the pages, db/market.ts and the unit tests read the same ones. No
// server imports.
import { isMarketCategory, type MarketCategorySlug } from "./categories";

export type MarketTab = "buy" | "do";

export const MARKET_PAGE_SIZE = 24;
export const MARKET_HOME_COUNT = 6;
export const MAX_QUERY_LENGTH = 60;

// What a visitor typed in the search box, made safe to hand to a PostgREST
// filter: letters, digits, spaces and the few marks names use (& ' . -),
// nothing that could end a filter or add a wildcard (, ( ) * % : " \).
// Two characters at least; anything shorter is no search at all.
export function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} &'.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

export function cleanPage(raw: unknown): number {
  const n = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : 1;
  return n >= 1 ? n : 1;
}

export type MarketParams = { tab: MarketTab; q: string | null; category: MarketCategorySlug | null; section: string | null; madeOnly: boolean; page: number };

const SECTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// /market?tab=do&q=football&cat=sports-fitness&made=1&page=2. On "Things to
// buy" cat is a Market category; on "Things to do" it is a section.
export function parseMarketParams(params: Record<string, string | string[] | undefined>): MarketParams {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const tab: MarketTab = one("tab") === "do" ? "do" : "buy";
  const cat = one("cat");
  return {
    tab,
    q: cleanQuery(one("q")),
    category: tab === "buy" && isMarketCategory(cat) ? cat : null,
    section: tab === "do" && typeof cat === "string" && SECTION_SLUG.test(cat) && cat.length <= 60 ? cat : null,
    madeOnly: one("made") === "1",
    page: cleanPage(one("page")),
  };
}

// The /market link for these choices (anything left out is the default).
// A Market category on "Things to buy" has its own page, /market/<category>.
export function marketHref(p: Partial<MarketParams>): string {
  const tab = p.tab ?? "buy";
  const base = tab === "buy" && p.category ? `/market/${p.category}` : "/market";
  const query = new URLSearchParams();
  if (tab === "do") query.set("tab", "do");
  if (p.q) query.set("q", p.q);
  if (tab === "do" && p.section) query.set("cat", p.section);
  if (tab === "do" && p.madeOnly) query.set("made", "1");
  if (p.page && p.page > 1) query.set("page", String(p.page));
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

export function productHref(sellerSlug: string, productSlug: string): string {
  return `/market/p/${sellerSlug}/${productSlug}`;
}

export function pageCount(total: number, pageSize: number = MARKET_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// The row range PostgREST reads for a page (inclusive).
export function pageRange(page: number, pageSize: number = MARKET_PAGE_SIZE): [number, number] {
  const from = (Math.max(1, page) - 1) * pageSize;
  return [from, from + pageSize - 1];
}

