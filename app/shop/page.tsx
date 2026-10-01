import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage, countLiveBusinesses } from "@/app/_components/CategoryPage";
import { listSections } from "@/db/categories";

// /shop is the Shop Bahamian section (brief 15, §4). It needs its own file
// because /shop/<org> and /shop/<org>/drop/<slug> live under this folder,
// and Next serves a static segment before app/[category]; the page itself
// is the same data-driven section page every section gets.
export const revalidate = 300;

const SECTION = "shop";

async function shopSection() {
  try {
    return (await listSections()).find((s) => s.slug === SECTION) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const section = await shopSection();
  if (!section) return {};
  const live = await countLiveBusinesses(SECTION);
  return {
    title: `${section.name} | PortPass Bahamas`,
    description: live > 0 ? "Drops and pre-orders from Bahamian brands. Reserve your size, pay the brand directly." : `${section.name} — coming soon to PortPass.`,
    robots: live === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopSectionPage() {
  const section = await shopSection();
  if (!section) notFound();
  return <CategoryPage section={section} />;
}
