import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { claimLinkInfo } from "@/db/adminBusinessActions";
import { getSession } from "@/lib/auth/session";
import { PORTPASS_WHATSAPP_URL } from "@/lib/contact";
import { ClaimButton } from "./ClaimButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim your business | PortPass Bahamas",
  robots: { index: false, follow: false },
  // The address holds the one-use token: never send it on to another site.
  referrer: "no-referrer" as const,
};

// The page a business owner lands on from the claim link PortPass sent
// them (brief 08, 1.2). Sign in, press one button, and the page PortPass
// built is theirs to manage.
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await claimLinkInfo(token);
  if (!link) notFound();
  const session = await getSession();
  const next = encodeURIComponent(`/claim/${token}`);

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Claim your business", href: `/claim/${token}` }]} />
      <div className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" />Your page is ready</div>
        <h1>{link.businessName}</h1>
        {link.state === "used" ? (
          <>
            <p className="auth-lead">This link has already been used. If you claimed it, sign in to manage your page. If you didn&rsquo;t, tell us straight away.</p>
            <div className="auth-actions">
              <Link className="primary-button" href="/login">Sign in →</Link>
              <a className="auth-text-button" href={PORTPASS_WHATSAPP_URL}>Message PortPass on WhatsApp</a>
            </div>
          </>
        ) : link.state === "expired" ? (
          <>
            <p className="auth-lead">This link has expired. Message us and we&rsquo;ll send you a new one.</p>
            <div className="auth-actions"><a className="primary-button" href={PORTPASS_WHATSAPP_URL}>Message PortPass on WhatsApp →</a></div>
          </>
        ) : session ? (
          <>
            <p className="auth-lead">PortPass built this page for you. Claim it and it&rsquo;s yours to manage: your prices, photos, team and bookings.</p>
            <p className="auth-hint">You&rsquo;re signed in as {session.email ?? "your account"}. The business will belong to this account.</p>
            <ClaimButton token={token} businessName={link.businessName} />
          </>
        ) : (
          <>
            <p className="auth-lead">PortPass built this page for you. Sign in with your email, then claim it. It takes a minute, and there&rsquo;s no password.</p>
            {/* /login makes the account if the email is new, so one button serves both. */}
            <div className="auth-actions">
              <Link className="primary-button" href={`/login?next=${next}`}>Sign in with my email →</Link>
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
