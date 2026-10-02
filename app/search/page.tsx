import Link from "next/link";
import { BusinessLogo } from "@/app/_components/blocks/BusinessLogo";
import { DEFAULT_BRAND } from "@/app/_components/blocks/brand";
import { categoryLabel } from "@/app/_components/blocks/categoryLabel";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listPublishedOrganizations, type OrganizationDirectoryEntry } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { getNavTree } from "@/lib/navSections";
import { matchesQuery, searchTerms } from "@/lib/seo/search";
import "@/app/_components/seo/seo.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search | PortPass Bahamas",
  description: "Search the businesses you can book on PortPass in Nassau and The Bahamas.",
  // A results page is never a page of its own in search results.
  robots: { index: false, follow: true },
};

// Search across what is live on PortPass (brief 11: the homepage's
// structured data points search engines here). Businesses by name, what
// they do, their section and subsection and where they are; sections and
// subsections by name. Nothing personal is searched and nothing typed here
// is stored.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 80) : "";
  const terms = searchTerms(query);
  const [businesses, tree] = await Promise.all([
    withOneRetry(() => listPublishedOrganizations()).catch((): OrganizationDirectoryEntry[] => []),
    getNavTree().catch(() => []),
  ]);
  const subsectionName = new Map(tree.flatMap((section) => section.subsections.map((sub) => [sub.slug, sub.name] as const)));
  const places = (business: OrganizationDirectoryEntry) => [business.area, business.island, !business.island || /new providence/i.test(business.island) ? "Nassau New Providence" : null];
  const businessHits = terms.length ? businesses.filter((business) => matchesQuery(terms, [business.name, business.oneLiner, categoryLabel(business.primaryCategory), business.subcategory ? (subsectionName.get(business.subcategory) ?? null) : null, ...places(business)])) : [];
  const sections = [
    ...tree.map((section) => ({ label: section.name, name: section.name, href: section.href })),
    ...tree.flatMap((section) => section.subsections.map((sub) => ({ label: `${sub.name} · ${section.name}`, name: sub.name, href: sub.href }))),
  ];
  const sectionHits = terms.length ? sections.filter((section) => matchesQuery(terms, [section.name])) : [];

  return (
    <main className={`tpl-page search-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Search", href: "/search" }]} />
      <div className="search-body">
        <h1>Search PortPass</h1>
        <form className="search-form" action="/search" method="get" role="search">
          <label htmlFor="search-q" className="search-label">What are you looking for?</label>
          <div className="search-row">
            <input id="search-q" name="q" type="search" defaultValue={query} maxLength={80} placeholder="Kids football, wedding officiant, photo booth…" autoComplete="off" />
            <button className="home-button" type="submit">Search</button>
          </div>
        </form>

        {terms.length > 0 && (
          <div className="search-results" aria-live="polite">
            {sectionHits.length > 0 && (
              <section aria-labelledby="search-sections">
                <h2 id="search-sections">Sections</h2>
                <ul className="search-sections">
                  {sectionHits.map((section) => <li key={section.href}><Link href={section.href}>{section.label} →</Link></li>)}
                </ul>
              </section>
            )}
            <section aria-labelledby="search-businesses">
              <h2 id="search-businesses">{businessHits.length === 0 ? `Nothing on PortPass matches “${query}” yet` : `${businessHits.length} ${businessHits.length === 1 ? "business" : "businesses"}`}</h2>
              {businessHits.length > 0 ? (
                <ul className="search-list">
                  {businessHits.map((business) => (
                    <li key={business.slug}>
                      <Link href={directoryHref(business.slug, business.primaryCategory)}>
                        <BusinessLogo logoUrl={business.logoUrl} name={business.name} brand={business.brandColor ?? DEFAULT_BRAND} size="sm" />
                        <span><b>{business.name}</b><small>{[categoryLabel(business.primaryCategory), business.oneLiner].filter(Boolean).join(" · ")}</small></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="search-none">PortPass is adding businesses every week. <Link href="/">Browse the sections</Link>, or tell us what you need from a section page and we&rsquo;ll let you know when it opens.</p>
              )}
            </section>
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
