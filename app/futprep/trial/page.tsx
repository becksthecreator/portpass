import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RegistrationForm } from "../register/RegistrationForm";
import { listFutprepOffers, listTrialSessions, type FutprepAvailability, type TrialSession } from "@/db/registrations";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { getSession } from "@/lib/auth/session";

// "First Saturday free with a PortPass account" (brief 06 v2, Part C): a
// signed-in parent books one free Saturday for a child, on the term's
// trial dates, with the full safety form. Three free spots per class per
// Saturday; once per child. The rules are enforced again on the server.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free first Saturday | Futprep Athletics",
  description: "Your child's first Futprep Saturday is free with a PortPass account.",
  robots: { index: false, follow: true },
};

export default async function FutprepTrialPage() {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent("/futprep/trial")}`);

  const offers = (await listFutprepOffers({ publicOnly: true }).catch(() => [] as FutprepAvailability[]))
    .filter((offer) => offer.programType === "term" && offer.trialDates.length > 0);
  const sessionsByOffer: Record<string, TrialSession[]> = {};
  await Promise.all(offers.map(async (offer) => {
    sessionsByOffer[`${offer.programId}:${offer.termId}`] = await listTrialSessions(offer.programId, offer.termId).catch(() => []);
  }));
  const bookable = offers.filter((offer) => (sessionsByOffer[`${offer.programId}:${offer.termId}`] ?? []).length > 0);

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>FREE FIRST SATURDAY</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href="/futprep/register">Register for the term</Link>
        </div>
      </header>
      {bookable.length === 0 ? (
        <section className="registration-confirmation">
          <div className="eyebrow">Free first Saturday</div>
          <h1>No free Saturdays open right now.</h1>
          <p className="confirmation-lead">Free first Saturdays run at the start of a term. You can still register for the term now.</p>
          <a className="primary-button" href="/futprep/register">Register for the term →</a>
        </section>
      ) : (
        <Suspense fallback={null}>
          <RegistrationForm
            mode="trial"
            attribution={{ ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "member_perk", utmCampaign: "free_first_saturday" }}
            offers={bookable}
            initialOfferKey={bookable.length === 1 ? `${bookable[0].programId}:${bookable[0].termId}` : null}
            trialSessions={sessionsByOffer}
            prefill={{ parentEmail: session.email ?? "", parentName: session.profile?.fullName ?? "" }}
            intro={{
              eyebrow: "Futprep · PortPass member perk",
              title: "Book a free first Saturday.",
              lead: "Your child's first Saturday is free with your PortPass account. One free Saturday per child. We still need the full safety form, so the coaches know who they're looking after.",
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
