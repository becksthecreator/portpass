import Link from "next/link";
import { MarketProductCard } from "@/app/_components/market/MarketProductCard";
import { Reveal } from "@/app/_components/motion/Reveal";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listMarketProducts, listMarketThingsToDo, type MarketProduct, type MarketThing, type Paged } from "@/db/market";
import { getSectionOptions } from "@/lib/navSections";
import type { MarketParams } from "@/lib/market/browse";
import { marketCategoryName } from "@/lib/market/categories";
import { MARKET_TAGLINE } from "@/lib/market/copy";
import { BuyChips, DoChips, MarketSearch, MarketTabs, Pager, ThingCard } from "./MarketBits";
import "../market.css";

// A failed read shows an empty list, never an error page.
async function safe<T>(label: string, work: () => Promise<Paged<T>>): Promise<Paged<T>> {
  try {
    return await work();
  } catch (error) {
    console.error(`market: ${label}`, error instanceof Error ? error.message : "");
    return { items: [], total: 0 };
  }
}

const none = <T,>(): Promise<Paged<T>> => Promise.resolve({ items: [], total: 0 });

// /market and /market/<category> (brief 25, part B): Things to buy and
// Things to do, server-rendered, newest first, a page at a time. Only what
// the two views allow is ever read (db/market.ts). Motion: the heading
// and the grid rise in (<Reveal>), the chips pop (Bounce Badges) and the
// Search button squishes; nothing here is about money or a child's
// details.
export async function MarketBrowse({ params }: { params: MarketParams }) {
  const [buy, todo, sections] = await Promise.all([
    params.tab === "buy" ? safe("products", () => listMarketProducts({ q: params.q, category: params.category, page: params.page })) : none<MarketProduct>(),
    params.tab === "do" ? safe("things to do", () => listMarketThingsToDo({ q: params.q, section: params.section, madeOnly: params.madeOnly, page: params.page })) : none<MarketThing>(),
    params.tab === "do" ? getSectionOptions().catch(() => []) : Promise.resolve([]),
  ]);
  const categoryName = params.category ? marketCategoryName(params.category) : null;
  const heading = params.tab === "buy" ? (categoryName ? `${categoryName}, made here` : "Things to buy, made here") : "Things to do";
  const filtered = Boolean(params.q || params.category || params.section || params.madeOnly);

  return (
    <main className={`market-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={params.category ? [{ label: "PortPass Market", href: "/market" }, { label: categoryName ?? "", href: `/market/${params.category}` }] : [{ label: "PortPass Market", href: "/market" }]} />

      <section className="mkt-hero">
        <Reveal className="mkt-hero-inner" variant="rise">
          <p className="mkt-eyebrow">PortPass Market</p>
          <h1>Find, book and buy, here at home.</h1>
          <p className="mkt-lede">Things Bahamian businesses make and sell, and the classes, sessions and places they open to you. You pay each business directly.</p>
        </Reveal>
        <MarketSearch params={params} />
      </section>

      <div className="mkt-body">
        <MarketTabs params={params} />
        {params.tab === "buy" ? <BuyChips params={params} /> : <DoChips params={params} sections={sections.map((s) => ({ slug: s.slug, name: s.name }))} />}

        <div className="mkt-results-head">
          <h2>{heading}</h2>
          <p>
            {params.tab === "buy" ? buy.total : todo.total} {(params.tab === "buy" ? buy.total : todo.total) === 1 ? "result" : "results"}
            {params.q ? <> for &ldquo;{params.q}&rdquo;</> : null} · newest first
            {filtered && <> · <Link href={params.tab === "do" ? "/market?tab=do" : "/market"}>Clear</Link></>}
          </p>
          {params.tab === "buy" && <p className="mkt-note">Every seller here has been checked by PortPass: Made in The Bahamas.</p>}
        </div>

        {params.tab === "buy" ? (
          buy.items.length === 0 ? (
            <p className="mkt-empty">{filtered ? "Nothing matches that yet. Try another word or category." : "The first sellers are getting ready. Check back soon, or sell your own."} <Link href="/sell">Sell on PortPass Market →</Link></p>
          ) : (
            <Reveal as="ul" className="mkt-grid" variant="rise" stagger>
              {buy.items.map((product, index) => <li key={product.id}><MarketProductCard product={product} eager={index < 2} /></li>)}
            </Reveal>
          )
        ) : todo.items.length === 0 ? (
          <p className="mkt-empty">{filtered ? "Nothing matches that yet. Try another word or section." : "Nothing open yet."}</p>
        ) : (
          <Reveal as="ul" className="mkt-things" variant="rise" stagger>
            {todo.items.map((thing) => <li key={thing.id}><ThingCard thing={thing} /></li>)}
          </Reveal>
        )}

        <Pager params={params} total={params.tab === "buy" ? buy.total : todo.total} />

        <aside className="mkt-sell">
          <h2>Make something here?</h2>
          <p>Sell it on PortPass Market. Buyers order on PortPass and pay you directly.</p>
          <Link className="home-button" href="/sell">Sell on PortPass Market</Link>
        </aside>
        <p className="mkt-tagline">{MARKET_TAGLINE}</p>
      </div>
      <SiteFooter />
    </main>
  );
}
