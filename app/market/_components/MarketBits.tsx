import Link from "next/link";
import { formatAgeRange, formatPrice } from "@/app/_components/blocks/format";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { MadeBadge } from "@/app/_components/market/MadeBadge";
import type { MarketThing } from "@/db/market";
import { BOOKING_EXCLUDED_SLUGS, bookPath, isBookable } from "@/lib/bookings/rules";
import { marketHref, pageCount, type MarketParams } from "@/lib/market/browse";
import { MARKET_CATEGORIES } from "@/lib/market/categories";

// The pieces of PortPass Market's browse pages (brief 25, part B). Server
// components: the search box is a plain GET form, the tabs, chips and pages
// are links, so the Market works before (and without) JavaScript.

export function MarketSearch({ params }: { params: MarketParams }) {
  const action = params.tab === "buy" && params.category ? `/market/${params.category}` : "/market";
  return (
    <form className="mkt-search" role="search" action={action} method="get">
      <label htmlFor="mkt-q" className="mkt-visually-hidden">Search PortPass Market</label>
      <input id="mkt-q" name="q" type="search" defaultValue={params.q ?? ""} maxLength={60} placeholder={params.tab === "do" ? "Football, a DJ, a venue…" : "Candles, jerseys, a seller…"} autoComplete="off" />
      {params.tab === "do" && <input type="hidden" name="tab" value="do" />}
      {params.tab === "do" && params.section && <input type="hidden" name="cat" value={params.section} />}
      {params.tab === "do" && params.madeOnly && <input type="hidden" name="made" value="1" />}
      <button className="home-button" type="submit">Search</button>
    </form>
  );
}

export function MarketTabs({ params }: { params: MarketParams }) {
  return (
    <nav className="mkt-tabs" aria-label="PortPass Market">
      <Link href={marketHref({ tab: "buy", q: params.q })} aria-current={params.tab === "buy" ? "page" : undefined}>Things to buy</Link>
      <Link href={marketHref({ tab: "do", q: params.q })} aria-current={params.tab === "do" ? "page" : undefined}>Things to do</Link>
    </nav>
  );
}

// Things to buy: All plus the eight Market categories (Bounce Badges, the
// same pop the section pages' chips have: lib/motion/public.css).
export function BuyChips({ params }: { params: MarketParams }) {
  return (
    <nav className="subsection-chips mkt-chips" aria-label="Things to buy by category">
      <Link className={`subsection-chip${!params.category ? " is-current" : ""}`} href={marketHref({ tab: "buy", q: params.q })} aria-current={!params.category ? "page" : undefined}>All</Link>
      {MARKET_CATEGORIES.map((c) => (
        <Link key={c.slug} className={`subsection-chip${params.category === c.slug ? " is-current" : ""}`} href={marketHref({ tab: "buy", q: params.q, category: c.slug })} aria-current={params.category === c.slug ? "page" : undefined}>{c.name}</Link>
      ))}
    </nav>
  );
}

// Things to do: All plus the sections businesses list under, and the "Made
// in The Bahamas" filter (businesses that are also verified sellers).
export function DoChips({ params, sections }: { params: MarketParams; sections: { slug: string; name: string }[] }) {
  return (
    <>
      <nav className="subsection-chips mkt-chips" aria-label="Things to do by section">
        <Link className={`subsection-chip${!params.section ? " is-current" : ""}`} href={marketHref({ ...params, section: null, page: 1 })} aria-current={!params.section ? "page" : undefined}>All</Link>
        {sections.map((s) => (
          <Link key={s.slug} className={`subsection-chip${params.section === s.slug ? " is-current" : ""}`} href={marketHref({ ...params, section: s.slug, page: 1 })} aria-current={params.section === s.slug ? "page" : undefined}>{s.name}</Link>
        ))}
      </nav>
      <p className="mkt-filter">
        <Link href={marketHref({ ...params, madeOnly: !params.madeOnly, page: 1 })} className={`mkt-toggle${params.madeOnly ? " is-on" : ""}`}>
          <span aria-hidden="true" className="mkt-toggle-box" />
          {params.madeOnly ? "Showing Made in The Bahamas only: show everything" : "Show Made in The Bahamas only"}
        </Link>
      </p>
    </>
  );
}

export function Pager({ params, total }: { params: MarketParams; total: number }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  const page = Math.min(params.page, pages);
  return (
    <nav className="mkt-pager" aria-label="Pages">
      {page > 1 ? <Link href={marketHref({ ...params, page: page - 1 })} rel="prev">← Newer</Link> : <span />}
      <span>Page {page} of {pages}</span>
      {page < pages ? <Link href={marketHref({ ...params, page: page + 1 })} rel="next">Older →</Link> : <span />}
    </nav>
  );
}

// Where a thing to do leads: its own booking request where the business
// takes them, its own page or link on PortPass, otherwise the business
// page (which has its buttons). No new booking code (brief 25, B1).
export function thingHref(thing: MarketThing): string {
  const page = directoryHref(thing.orgSlug, thing.orgCategory);
  const action = (thing.actionUrl ?? "").trim();
  if (action.startsWith("/") && !action.startsWith("//")) return action;
  if (thing.orgSlug === "futprep") return `${page}/${thing.slug}`;
  if (!BOOKING_EXCLUDED_SLUGS.includes(thing.orgSlug) && isBookable({ priceCents: thing.priceCents, actionUrl: thing.actionUrl })) return bookPath(page, thing.slug);
  return page;
}

export function ThingCard({ thing }: { thing: MarketThing }) {
  const price = thing.priceCents === null ? null : formatPrice(thing.priceCents, thing.priceUnit);
  const facts = [thing.scheduleText, formatAgeRange(thing.ageMin, thing.ageMax, thing.ageLabel)].filter(Boolean).join(" · ");
  const picture = thing.imageUrl ?? thing.orgLogoUrl;
  return (
    <Link className="mkt-thing" href={thingHref(thing)}>
      <span className="mkt-thing-pic" aria-hidden="true">{picture ? <img src={picture} alt="" loading="lazy" decoding="async" /> : <span>{thing.orgName.slice(0, 1)}</span>}</span>
      <span className="mkt-thing-body">
        <strong>{thing.name}</strong>
        <span className="mkt-thing-org">{thing.orgName}</span>
        {thing.summary && <span className="mkt-thing-summary">{thing.summary}</span>}
        {facts && <span className="mkt-thing-facts">{facts}</span>}
        <span className="mkt-thing-foot">
          {price && <b>{price}</b>}
          {thing.madeInBahamas && <MadeBadge variant="inline" />}
        </span>
      </span>
    </Link>
  );
}
