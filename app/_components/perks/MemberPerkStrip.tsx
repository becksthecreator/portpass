import { livePerksBySlug } from "@/db/memberPerks";
import { bothPrices, perkChip, perkConditions } from "@/lib/memberPerks";
import { PerkUnlock } from "./PerkUnlock";
import "./perks.css";

type PricedOffering = { id: number; name: string; priceCents: number | null };

// A business's live member perks on its own page (brief 10, 6.2): the gold
// chip, the perk in the business's words, its conditions in plain words
// and, where the perk is money and there is a real price, both prices
// ("$300 · Members $270"). Nothing renders when the business has no perk.
export async function MemberPerkStrip({ slug, path, offerings = [] }: { slug: string; path?: string; offerings?: PricedOffering[] }) {
  const perks = (await livePerksBySlug()).get(slug) ?? [];
  if (perks.length === 0) return null;
  const priced = offerings.filter((o): o is PricedOffering & { priceCents: number } => o.priceCents !== null);

  return (
    <section className="perk-strip" aria-label="Member perks">
      <div className="perk-strip-inner">
        <span className="perk-strip-eyebrow">PortPass member {perks.length === 1 ? "perk" : "perks"}</span>
        <ul className="perk-strip-list">
          {perks.map((perk) => {
            const conditions = perkConditions(perk);
            const prices = priced
              .filter((o) => perk.offeringId === null || perk.offeringId === o.id)
              .map((o) => ({ id: o.id, name: o.name, line: bothPrices(o.priceCents, perk) }))
              .filter((o): o is { id: number; name: string; line: string } => o.line !== null)
              .slice(0, 4);
            return (
              <li key={perk.id}>
                <span className="perk-chip">{perkChip(perk)}</span>
                <strong>{perk.title}</strong>
                {conditions && <span className="perk-strip-conditions">{conditions}</span>}
                {prices.length > 0 && (
                  <ul className="perk-strip-prices">
                    {prices.map((o) => <li key={o.id}>{o.name}: {o.line}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="perk-strip-how">Free to join. Book while signed in, or show your Member Pass when you pay: the business applies the perk.</p>
        <PerkUnlock path={path} />
      </div>
    </section>
  );
}
