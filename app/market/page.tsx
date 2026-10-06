import type { Metadata } from "next";
import { parseMarketParams } from "@/lib/market/browse";
import { MarketBrowse } from "./_components/MarketBrowse";

const TITLE = "PortPass Market | Find, book and buy in The Bahamas";
const DESCRIPTION = "Things Bahamian businesses make and sell, with the Made in The Bahamas badge, and the classes, sessions and places they open to you. Pay each business directly.";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// A search or a later page is the same listing filtered: it points search
// engines at the plain /market and keeps itself out of the index.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = parseMarketParams(await searchParams);
  const plain = params.tab === "buy" && !params.q && params.page === 1;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "https://portpassbahamas.com/market" },
    openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/market" },
    robots: plain ? undefined : { index: false, follow: true },
  };
}

// PortPass Market (brief 25, part B): Things to buy and Things to do.
export default async function MarketPage({ searchParams }: { searchParams: SearchParams }) {
  return <MarketBrowse params={parseMarketParams(await searchParams)} />;
}
