import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseMarketParams } from "@/lib/market/browse";
import { isMarketCategory, marketCategoryName } from "@/lib/market/categories";
import { MarketBrowse } from "../_components/MarketBrowse";

type Params = Promise<{ category: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { category } = await params;
  if (!isMarketCategory(category)) return {};
  const name = marketCategoryName(category)!;
  const query = parseMarketParams(await searchParams);
  const url = `https://portpassbahamas.com/market/${category}`;
  const title = `${name} made in The Bahamas | PortPass Market`;
  const description = `${name} from Bahamian businesses PortPass has checked, newest first. Order on PortPass and pay the business directly.`;
  return { title, description, alternates: { canonical: url }, openGraph: { type: "website", siteName: "PortPass Bahamas", title, description, url }, robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined };
}

// /market/<category>: Things to buy in one Market category (brief 25, B2).
export default async function MarketCategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { category } = await params;
  if (!isMarketCategory(category)) notFound();
  const query = parseMarketParams(await searchParams);
  return <MarketBrowse params={{ ...query, tab: "buy", category, section: null, madeOnly: false }} />;
}
