import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { requireSignedIn } from "@/lib/auth/guards";
import { destinationsFor } from "@/lib/auth/routing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Where to? | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// Shown only to people with more than one place to be (a coach who is also
// a parent, a founder who also runs a business). Each card goes through
// /api/auth/go so the choice is remembered.
export default async function WhereToPage() {
  const session = await requireSignedIn("/where-to");
  const destinations = destinationsFor(session);
  const primary = destinations.filter((d) => d.kind !== "account");
  if (primary.length === 0) redirect("/account");
  if (primary.length === 1) redirect(primary[0].href);

  return (
    <main className="form-page auth-page">
      <SiteHeader />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Signed in</div>
        <h1>Where to?</h1>
        <p className="auth-lead">You have more than one place on PortPass. Pick one — you can switch from the account menu any time.</p>
        <div className="chooser-grid">
          {destinations.map((d) => (
            <a key={d.href} className={`chooser-card chooser-${d.kind}`} href={`/api/auth/go?to=${encodeURIComponent(d.href)}`}>
              <strong>{d.label}</strong>
              <span>{d.detail}</span>
              <b>Open →</b>
            </a>
          ))}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
