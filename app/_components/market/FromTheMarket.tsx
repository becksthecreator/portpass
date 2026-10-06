import Link from "next/link";
import { listNewestMarketProducts, type MarketProduct } from "@/db/market";
import { MARKET_HOME_COUNT } from "@/lib/market/browse";
import { Reveal } from "../motion/Reveal";
import { MarketProductCard } from "./MarketProductCard";
import "./market-cards.css";

// The homepage's "From the Market" strip (brief 25, B3): the six newest
// products of verified sellers, under "Open now". The section motion the
// homepage already has: the heading rises in, the cards arrive in turn.
// Hidden while the Market has nothing to show, and a failed read hides it
// rather than breaking the homepage.
export async function FromTheMarket() {
  let products: MarketProduct[] = [];
  try {
    products = await listNewestMarketProducts(MARKET_HOME_COUNT);
  } catch (error) {
    console.error("homepage: Market strip", error instanceof Error ? error.message : "");
    return null;
  }
  if (products.length === 0) return null;

  return (
    <section className="home-market" aria-labelledby="home-market-title">
      <Reveal className="home-section-heading" variant="rise">
        <span className="home-eyebrow">PortPass Market</span>
        <h2 id="home-market-title">From the Market.</h2>
      </Reveal>
      <Reveal as="ul" className="mkt-grid home-market-grid" variant="rise" stagger>
        {products.map((product) => <li key={product.id}><MarketProductCard product={product} /></li>)}
      </Reveal>
      <p className="home-market-more"><Link className="home-button home-button-light" href="/market">See the Market →</Link></p>
    </section>
  );
}
