import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { getBusinessBySlug, listBusinessOfferings } from "@/db/business";
import { listBusinessPerks, listBusinessRedemptions } from "@/db/memberPerks";
import { requireOrgRole } from "@/lib/auth/guards";
import { nassauToday } from "@/lib/futprepTerms";
import { dollars, isPerkLive, perkChip, perkConditions } from "@/lib/memberPerks";
import { canEditShop } from "@/lib/shop/access";
import { PassCheck } from "./PassCheck";
import { PerkActions } from "./PerkActions";
import { PerkForm } from "./PerkForm";
import "@/app/shop/shop.css";
import "@/app/_components/perks/perks.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member perks | Business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const STATUS_LABEL = { draft: "Draft", live: "Live", ended: "Ended" } as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Nassau" });
}

// A business's member perks (brief 10, 6.3): check a Member Pass, record
// a perk used, and (owners and admins) choose, publish and end the perks.
// Staff see the counter tools and the list; they don't edit perks.
export default async function BusinessPerksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireOrgRole({ slug }, "org_staff", `/business/${slug}/perks`);
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const [perks, redemptions, offerings] = await Promise.all([listBusinessPerks(business.id), listBusinessRedemptions(business.id), listBusinessOfferings(business.id)]);
  const canEdit = canEditShop(access);
  const today = nassauToday();
  const liveNow = perks.filter((perk) => isPerkLive(perk, today));
  const offeringName = new Map(offerings.map((o) => [o.id, o.name]));

  return (
    <main className="form-page auth-page theme-night seller-page">
      <SiteHeader breadcrumb={[{ label: "My business", href: `/business/${slug}` }, { label: "Member perks", href: `/business/${slug}/perks` }]} />
      <div className="seller-wrap">
        <div className="eyebrow"><span className="eyebrow-dot" />Member perks</div>
        <h1 className="seller-title">{business.name}</h1>
        <p className="auth-lead">Something extra for customers who have a free PortPass account. You choose it and you apply it when you take payment, the way you would for a special. PortPass never changes what a customer pays you.</p>

        <section className="seller-block" aria-labelledby="perks-check">
          <h2 id="perks-check">Check a Member Pass</h2>
          {liveNow.length === 0 ? (
            <p className="seller-empty">You have no perk running today, so there is nothing to check a pass for.{canEdit ? " Add one below." : ""}</p>
          ) : (
            <PassCheck orgId={business.id} />
          )}
        </section>

        <section className="seller-block" aria-labelledby="perks-list">
          <h2 id="perks-list">Your perks</h2>
          {perks.length === 0 ? (
            <p className="seller-empty">No perks yet.</p>
          ) : (
            <ul className="seller-list">
              {perks.map((perk) => {
                const scheduled = perk.status === "live" && !isPerkLive(perk, today);
                return (
                  <li key={perk.id} className="seller-row perk-row">
                    <span className="perk-row-top">
                      <span className="perk-chip">{perkChip(perk)}</span>
                      <span className={`perk-status perk-status-${perk.status}`}>{scheduled ? (perk.startsOn && perk.startsOn > today ? "Starts later" : "Past its end date") : STATUS_LABEL[perk.status]}</span>
                    </span>
                    <strong>{perk.title}</strong>
                    <span>{[perk.offeringId ? `Only for ${offeringName.get(perk.offeringId) ?? "one offering"}` : "For everything you offer", perkConditions(perk)].filter(Boolean).join(" · ")}</span>
                    {perk.status === "ended" && perk.endedReason && <span>Ended by PortPass: {perk.endedReason}</span>}
                    {canEdit && perk.status !== "ended" && <PerkActions orgId={business.id} perkId={perk.id} status={perk.status} title={perk.title} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {canEdit && (
          <section className="seller-block" aria-labelledby="perks-new">
            <h2 id="perks-new">Add a perk</h2>
            <p className="seller-note">It is saved as a draft first. Once you publish a perk you must honour it: it can be ended at any time, but not changed, and anyone who has already used it keeps it.</p>
            <PerkForm orgId={business.id} offerings={offerings.filter((o) => o.priceCents !== null).map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents as number }))} />
          </section>
        )}

        <section className="seller-block" aria-labelledby="perks-used">
          <h2 id="perks-used">Perks used</h2>
          {redemptions.length === 0 ? (
            <p className="seller-empty">None yet. Each one you record at the counter shows here.</p>
          ) : (
            <ul className="seller-list">
              {redemptions.map((r) => (
                <li key={r.id} className="seller-row">
                  <strong>Member ✓ {r.firstName}{r.memberNumber ? ` · ${r.memberNumber}` : ""}</strong>
                  <span>{[r.perkTitle, r.discountCents !== null ? `${dollars(r.discountCents)} off` : null, r.bookingRef, r.method === "online" ? "Booked online" : "At the counter", when(r.redeemedAt)].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="seller-note perk-privacy">You see a member&rsquo;s first name and member number, never their email or phone. PortPass does not pass those on.</p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
