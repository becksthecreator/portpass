import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { RegistrationForm } from "../../RegistrationForm";
import { openReturnLink } from "@/db/registrations";
import { EMPTY_ATTRIBUTION } from "@/lib/attribution";

// A returning family's early-access link (brief 06 v2, Part C). Staff send
// it by hand on WhatsApp, one family at a time. It fills in the parent,
// child, emergency contact and pick-up details from the child's last
// registration -- never the medical, allergy or medication fields -- and
// opens the next term before it opens to everyone, until early_access_until.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Early access | Futprep Athletics",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

type Params = Promise<{ token: string }>;

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>FUTPREP ATHLETICS</b><small>Early access for Futprep families</small></span></div>
          <Link className="header-link" href="/sports-fitness/futprep-athletics">Futprep home</Link>
        </div>
      </header>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="registration-confirmation">
      <div className="eyebrow">Early access</div>
      <h1>{title}</h1>
      <p className="confirmation-lead">{body}</p>
      <a className="primary-button" href="/futprep/register">Go to registration →</a>
    </section>
  );
}

export default async function FutprepReturnPage({ params }: { params: Params }) {
  const { token } = await params;
  const view = await openReturnLink(token).catch(() => ({ state: "invalid" as const }));

  if (view.state === "invalid") {
    return <Shell><Notice title="This link isn't valid." body="It may have been copied wrongly. Ask Futprep for a new early-access link, or register from the normal page when registration opens." /></Shell>;
  }
  if (view.state === "expired") {
    return <Shell><Notice title="This early-access link has expired." body="Early access has ended. Registration is open to everyone on the normal page while spots last." /></Shell>;
  }

  const first = view.prefill.childName.split(" ")[0] || "your child";
  const early = view.offers.filter((offer) => offer.earlyAccessOnly);
  const termNames = Array.from(new Set(early.map((offer) => offer.termName))).join(" / ");
  return (
    <Shell>
      <Suspense fallback={null}>
        <RegistrationForm
          attribution={{ ...EMPTY_ATTRIBUTION, utmSource: "futprep", utmMedium: "return_link", utmCampaign: "early_access" }}
          offers={view.offers}
          initialOfferKey={view.preselect ? `${view.preselect.programId}:${view.preselect.termId}` : null}
          returnToken={token}
          prefill={{
            parentName: view.prefill.parentName, parentEmail: view.prefill.parentEmail, parentPhone: view.prefill.parentPhone, relationship: view.prefill.relationship,
            childName: view.prefill.childName, childDob: view.prefill.childDob, gender: view.prefill.gender,
            emergencyContactName: view.prefill.emergencyContactName, emergencyContactPhone: view.prefill.emergencyContactPhone, authorizedPickup: view.prefill.authorizedPickup,
          }}
          intro={{
            eyebrow: `Futprep · early access${termNames ? ` · ${termNames}` : ""}`,
            title: `Welcome back. Register ${first}.`,
            lead: "We've filled in what we had from last time. Check each step, and re-enter your child's current allergies, conditions and medications.",
          }}
        />
      </Suspense>
    </Shell>
  );
}
