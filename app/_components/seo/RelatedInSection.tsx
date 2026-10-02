import Link from "next/link";
import { listSectionBusinesses, type SectionBusiness } from "@/db/organizations";
import { withOneRetry } from "@/db/supabase";
import { BusinessLogo } from "../blocks/BusinessLogo";
import { DEFAULT_BRAND } from "../blocks/brand";
import { directoryHref } from "../blocks/directoryHref";

// "More in Sports & Fitness" at the foot of a business page (brief 11, 4):
// up to three other businesses in the same section that are live, then a
// link to the section. Nothing renders when there are none, and a failed
// read shows nothing rather than an error.
export async function RelatedInSection({ section, sectionName, exceptSlug }: { section: string | null; sectionName: string | null; exceptSlug: string }) {
  if (!section || !sectionName) return null;
  let others: SectionBusiness[] = [];
  try {
    others = (await withOneRetry(() => listSectionBusinesses(section))).filter((business) => business.isPublished && business.slug !== exceptSlug).slice(0, 3);
  } catch {
    return null;
  }
  if (others.length === 0) return null;
  return (
    <section className="related-section" aria-labelledby="related-section-title">
      <div className="related-section-inner">
        <h2 id="related-section-title">More in {sectionName}</h2>
        <ul>
          {others.map((business) => (
            <li key={business.slug}>
              <Link href={directoryHref(business.slug, business.primaryCategory)}>
                <BusinessLogo logoUrl={business.logoUrl} name={business.name} brand={business.brandColor ?? DEFAULT_BRAND} size="sm" />
                <span>
                  <b>{business.name}</b>
                  {business.oneLiner && <small>{business.oneLiner}</small>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p><Link href={`/${section}`}>All of {sectionName} →</Link></p>
      </div>
    </section>
  );
}
