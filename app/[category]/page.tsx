import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPage, countLiveBusinesses } from "@/app/_components/CategoryPage";
import { listSections } from "@/db/categories";

// Every section that exists in the categories table gets a page here
// unless a hand-built one already claims the path (Next serves a static
// segment before a dynamic one, so /sports-fitness and /weddings keep
// their own files). Anything that isn't a visible section is a 404.
// ISR (speed brief, 29 Sept): five-minute cache, rebuilt on demand; no
// build-time prerender (the params list is empty), so CI's credential-less
// build never has to reach the database.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ category: string }>;

async function visibleSection(slug: string) {
  try {
    return (await listSections()).find((s) => s.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params;
  const section = await visibleSection(category);
  if (!section) return {};
  const live = await countLiveBusinesses(section.slug);
  return {
    title: `${section.name} in The Bahamas | PortPass Bahamas`,
    description: live > 0 ? `${section.name} you can book on PortPass in The Bahamas.` : `${section.name} in The Bahamas — coming soon to PortPass.`,
    // noindex only while there is nothing to book; the coming-soon threshold
    // drives the on-page label, not indexing (mirrors app/sitemap.ts).
    robots: live === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function SectionPage({ params }: { params: Params }) {
  const { category } = await params;
  const section = await visibleSection(category);
  if (!section) notFound();
  return <CategoryPage section={section} />;
}
