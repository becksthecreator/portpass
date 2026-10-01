import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { claimLinkInfo } from "@/db/adminBusinessActions";
import { getSession } from "@/lib/auth/session";
import { PORTPASS_WHATSAPP_URL } from "@/lib/contact";
import { ClaimButton } from "./ClaimButton";

// What a business owner sees from the claim link PortPass sent them
// (brief 08, 1.2): make an account or sign in, press one button, and the
// page PortPass built is theirs to manage. Shared by the link itself
// (/claim/<token>) and the page they come back to after signing in
// (/claim/continue).
export async function ClaimView({ token, path }: { token: string; path: string }) {
  const link = await claimLinkInfo(token);
  if (!link) notFound();
  const session = await getSession();

  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Claim your business", href: path }]} />
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
            <p className="auth-lead">PortPass built this page for you. Tell us your email and we&rsquo;ll send you a code, then claim it. It takes a minute, and there&rsquo;s no password.</p>
            {/* The link is a key, so it is not passed along in the sign-in
                address. It is kept in a short-lived cookie this site alone
                can read, and the owner comes back to /claim/continue. */}
            <form className="auth-actions" method="post" action="/api/claim/start">
              <input type="hidden" name="token" value={token} />
              <button className="primary-button" type="submit" name="via" value="signup">Continue with my email →</button>
              <button className="auth-text-button" type="submit" name="via" value="login">I already have a PortPass account</button>
            </form>
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
