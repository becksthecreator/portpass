import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessLogo } from "@/app/_components/blocks/BusinessLogo";
import { DEFAULT_BRAND } from "@/app/_components/blocks/brand";
import { categoryLabel } from "@/app/_components/blocks/categoryLabel";
import { directoryHref } from "@/app/_components/blocks/directoryHref";
import { JsonLd } from "@/app/_components/seo/JsonLd";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { ppDisplay, ppSans } from "@/app/fonts";
import { getPublishedGuide, guideBusinesses, type GuideBusiness } from "@/db/guides";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo/jsonLd";
import { fitDescription } from "@/lib/seo/titles";
import { GuideBody } from "../GuideBody";
import "../guides.css";

// ISR, like the other public pages: rebuilt when a guide is saved.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Nassau" });

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getPublishedGuide(slug);
  if (!guide) return {};
  const title = `${guide.title} | PortPass Bahamas`;
  const description = fitDescription(guide.description || guide.title);
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { type: "article", siteName: SITE_NAME, title, description, url, modifiedTime: guide.updatedAt }, twitter: { card: "summary_large_image", title, description } };
}

// A guide (brief 11, 3): written by the founders, linking to businesses
// that are live today. A business that isn't live any more simply isn't
// listed; the guide itself stays.
export default async function GuidePage({ params }: { params: Params }) {
  const { slug } = await params;
  const guide = await getPublishedGuide(slug);
  if (!guide) notFound();
  const businesses = await guideBusinesses(guide.id).catch((): GuideBusiness[] => []);
  const url = `/guides/${guide.slug}`;

  return (
    <main className={`tpl-page guide-page ${ppDisplay.variable} ${ppSans.variable}`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description || undefined,
          url: absoluteUrl(url),
          mainEntityOfPage: absoluteUrl(url),
          datePublished: guide.publishedAt ?? undefined,
          dateModified: guide.updatedAt,
          author: { "@type": "Person", name: "Antonio Beckford" },
          publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/`, logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/icons/app-icon-512.png` } },
          ...(businesses.length ? { mentions: businesses.map((business) => ({ "@type": "LocalBusiness", name: business.name, url: absoluteUrl(directoryHref(business.slug, business.primaryCategory)) })) } : {}),
        }}
      />
      <SiteHeader breadcrumb={[{ label: "Guides", href: "/guides" }, { label: guide.title, href: url }]} />
      <article className="guide-article">
        <header>
          <span className="guide-eyebrow">PortPass guide</span>
          <h1>{guide.title}</h1>
          <p className="guide-updated">Updated {longDate(guide.updatedAt)}</p>
        </header>
        <GuideBody body={guide.body} />
        {businesses.length > 0 && (
          <section className="guide-businesses" aria-labelledby="guide-businesses-title">
            <h2 id="guide-businesses-title">Book on PortPass</h2>
            <ul>
              {businesses.map((business) => (
                <li key={business.slug}>
                  <Link href={directoryHref(business.slug, business.primaryCategory)}>
                    <BusinessLogo logoUrl={business.logoUrl} name={business.name} brand={business.brandColor ?? DEFAULT_BRAND} size="sm" />
                    <span>
                      <b>{business.name}</b>
                      <small>{business.note ?? [categoryLabel(business.primaryCategory), business.oneLiner].filter(Boolean).join(" · ")}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="guide-more"><Link href="/guides">More guides →</Link></p>
      </article>
      <SiteFooter />
    </main>
  );
}
