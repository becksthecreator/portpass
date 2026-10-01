import { cookies } from "next/headers";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { CLAIM_COOKIE } from "@/lib/claimCookie";
import { ClaimView } from "../ClaimView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim your business | PortPass Bahamas",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

// Where an owner comes back to after signing in from a claim link. The
// link itself is not in this address: it is read from the short-lived
// cookie set when they pressed "Continue" on the link's own page.
export default async function ClaimContinuePage() {
  const token = (await cookies()).get(CLAIM_COOKIE)?.value ?? "";
  if (/^[a-f0-9]{48}$/.test(token)) return <ClaimView token={token} path="/claim/continue" />;
  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Claim your business", href: "/claim/continue" }]} />
      <div className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" />Nearly there</div>
        <h1>Open your link again</h1>
        <p className="auth-lead">You are signed in. Open the link PortPass sent you once more, on this phone or computer, and press the button to claim your page.</p>
      </div>
      <SiteFooter />
    </main>
  );
}
