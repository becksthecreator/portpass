import Link from "next/link";
import { listLivePerks } from "@/db/memberPerks";
import { PERKS_ROW_MINIMUM, perkChip, perkConditions } from "@/lib/memberPerks";
import { BusinessLogo } from "../blocks/BusinessLogo";
import { DEFAULT_BRAND } from "../blocks/brand";
import { directoryHref } from "../blocks/directoryHref";
import "./perks.css";

// The homepage's "Member perks" row (brief 10, 6.2). Hidden until three
// perks are live: two cards in a row look like a shelf that is mostly
// empty. Newest perk first, never ordered by who pays PortPass more.
export async function HomePerksRow() {
  const perks = await listLivePerks();
  if (perks.length < PERKS_ROW_MINIMUM) return null;

  return (
    <section className="home-perks" aria-labelledby="home-perks-title">
      <div className="home-section-heading">
        <span className="home-eyebrow">Free with a PortPass account</span>
        <h2 id="home-perks-title">Member perks.</h2>
      </div>
      <ul className="home-perks-grid">
        {perks.slice(0, 6).map((perk) => (
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
      <p className="home-perks-more"><Link href="/perks">See every member perk →</Link></p>
    </section>
  );
}
