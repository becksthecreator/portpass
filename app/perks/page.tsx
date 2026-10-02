import Link from "next/link";
import { BusinessLogo } from "@/app/_components/blocks/BusinessLogo";
import { DEFAULT_BRAND } from "@/app/_components/blocks/brand";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { PerkUnlock } from "@/app/_components/perks/PerkUnlock";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { listLivePerks, type PublicPerk } from "@/db/memberPerks";
import { getNavSections } from "@/lib/navSections";
import { perkChip, perkConditions } from "@/lib/memberPerks";
import { PerksFilter } from "./PerksFilter";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { sectionJsonLd } from "@/lib/seo/jsonLd";
import "@/app/_components/perks/perks.css";

// ISR, like the other public pages: rebuilt when a perk is published or ended.
export const revalidate = 300;

const TITLE = "Member perks | PortPass Bahamas";
const DESCRIPTION = "Perks from Bahamian businesses for people with a free PortPass account: money off, free extras and early booking.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://portpassbahamas.com/perks" },
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/perks" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

async function sectionNames(): Promise<Map<string, string>> {
  try {
    return new Map((await getNavSections()).map((s) => [s.href.slice(1), s.label]));
  } catch {
    return new Map();
  }
}

// Every live member perk, by section (brief 10, 6.2). Each business sets
// its own perk and some have none, so nothing here promises a saving
// "everywhere": it lists what is actually on offer today.
export default async function PerksPage() {
  const [perks, names] = await Promise.all([listLivePerks(), sectionNames()]);
  const bySection = new Map<string, PublicPerk[]>();
  for (const perk of perks) {
    const key = perk.section ?? "other";
    bySection.set(key, [...(bySection.get(key) ?? []), perk]);
  }
  const sections = [...bySection.keys()].map((slug) => ({ slug, name: names.get(slug) ?? (slug === "other" ? "More" : slug.replace(/-/g, " ")) }));

  return (
    <main className={`tpl-page perks-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Member perks", href: "/perks" }]} />
      <section className="category-hero category-hero-plain">
        <div className="category-hero-inner">
          <span className="category-hero-eyebrow">PortPass</span>
          <h1>Member perks.</h1>
          <p>
            {perks.length > 0
              ? `A PortPass account is free. These ${perks.length === 1 ? "is the perk" : `are the ${perks.length} perks`} Bahamian businesses are offering members today.`
              : "A PortPass account is free. Businesses are choosing their member perks now, and they will be listed here as each one goes live."}
          </p>
        </div>
      </section>

      <div className="perks-body">
        <div className="perks-join">
          <p><b>How it works.</b> Sign up free with your email. Book while signed in, or show your Member Pass at the counter. Each business chooses its own perk and applies it when you pay.</p>
          <PerkUnlock path="/perks" className="home-button" />
        </div>

        {perks.length === 0 ? (
          <p className="perks-empty">No perks are live yet. <Link href="/">Browse what you can book today →</Link></p>
        ) : (
          <>
            {sections.length > 1 && <PerksFilter sections={sections} />}
            {sections.map((section) => (
              <section className="perks-section" key={section.slug} data-perk-section={section.slug} aria-labelledby={`perks-${section.slug}`}>
                <h2 id={`perks-${section.slug}`}>{section.name}</h2>
                <ul className="perks-grid">
                  {(bySection.get(section.slug) ?? []).map((perk) => (
                    <li key={perk.id}>
                      <Link className="home-perk-card" href={directoryHref(perk.businessSlug, perk.section)}>
                        <span className="perk-chip">{perkChip(perk)}</span>
                        <span className="home-perk-business">
                          <BusinessLogo logoUrl={perk.logoUrl} name={perk.businessName} brand={perk.brandColor ?? DEFAULT_BRAND} size="sm" />
                          <b>{perk.businessName}</b>
                        </span>
                        <span className="home-perk-title">{perk.title}</span>
                        {perkConditions(perk) && <small>{perkConditions(perk)}</small>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <p className="perks-owner">Run a business? <Link href="/business">Offer a member perk on PortPass →</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
