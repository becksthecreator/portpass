import Link from "next/link";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RegistrationForm } from "../register/RegistrationForm";
import { listFutprepOffers, listTrialSessions, type FutprepAvailability, type TrialSession } from "@/db/registrations";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";
import { getSession } from "@/lib/auth/session";
import { tasterCardCopy, upcomingTaster } from "@/lib/futprepClasses";
import { nassauToday } from "@/lib/futprepTerms";

// The free taster Saturday (brief 12, replacing #97's two in-term free
// Saturdays): one pre-term Saturday per term, held as data on the term
// (program_terms.taster_date). A signed-in parent books it for a child with
// the full safety form; 3 spots per class; once per child. The rules are
// enforced again on the server.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Free taster Saturday | Futprep Athletics",
  description: "Try a Futprep class free before the term starts, with a PortPass account.",
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
  const taster = upcomingTaster(bookable, nassauToday());
  const copy = taster ? tasterCardCopy(taster) : null;

  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><BrandLogo /></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>FREE TASTER SATURDAY</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
          <Link className="header-link" href="/futprep/register">Register for the term</Link>
        </div>
      </header>
      {bookable.length === 0 ? (
        <section className="registration-confirmation">
          <div className="eyebrow">Free taster Saturday</div>
          <h1>No taster Saturday open right now.</h1>
          <p className="confirmation-lead">The free taster runs on a Saturday before each term starts. You can still register for the term now.</p>
          <a className="primary-button" href="/futprep/register">Register for the term →</a>
        </section>
      ) : (
        <Suspense fallback={null}>
          <RegistrationForm
            mode="trial"
            attribution={{ ...EMPTY_ATTRIBUTION, utmSource: "portpass", utmMedium: "member_perk", utmCampaign: "free_taster" }}
            offers={bookable}
            initialOfferKey={bookable.length === 1 ? `${bookable[0].programId}:${bookable[0].termId}` : null}
            trialSessions={sessionsByOffer}
            prefill={{ parentEmail: session.email ?? "", parentName: session.profile?.fullName ?? "" }}
            intro={{
              eyebrow: "Futprep · PortPass member perk",
              title: copy?.title ?? "Book the free taster Saturday.",
              lead: `${copy?.body ?? "Free with a PortPass account. Limited spots."} One free taster per child. We still need the full safety form, so the coaches know who they're looking after.`,
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
