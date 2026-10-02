import Link from "next/link";
import { listPlans } from "@/db/pricing";
import { requireAdmin } from "@/lib/auth/admin";
import { platformOwnerEmails } from "@/lib/auth/env";
import { googleSignInEnabled } from "@/lib/auth/google";
import { systemSwitches } from "@/lib/adminHealth";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_SUPPORT_EMAIL, PORTPASS_WHATSAPP_URL } from "@/lib/contact";
import { legalDate, PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal";
import { formatPriceCents } from "@/app/_components/blocks/format";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | PortPass admin",
  robots: { index: false, follow: false },
};

// Settings (brief 08, 1.12): PortPass's contact details, the plan prices,
// which legal versions are published, and what is switched on. The last
// part shows the NAMES of the settings each feature needs and whether
// they are set, never a value.
export default async function AdminSettingsPage() {
  const session = await requireAdmin("/admin/settings");
  const [plans, google] = await Promise.all([listPlans({ fresh: true }).catch(() => null), googleSignInEnabled().catch(() => false)]);
  const switches = systemSwitches();
  const founders = platformOwnerEmails().length;
  const off = switches.filter((s) => !s.on).length;

  return (
    <AdminShell session={session} current="/admin/settings" title="Settings" lede="Contact details, prices, legal versions, and what is switched on.">
      <section className="admin-group" aria-labelledby="settings-contact">
        <h2 id="settings-contact">PortPass contact details</h2>
        <dl className="admin-facts">
          <div><dt>Support email</dt><dd>{PORTPASS_SUPPORT_EMAIL}</dd></div>
          <div><dt>Phone and WhatsApp</dt><dd>{PORTPASS_PHONE_DISPLAY} · <a className="admin-inline-link" href={PORTPASS_WHATSAPP_URL}>Open WhatsApp</a></dd></div>
        </dl>
        <p className="admin-form-note">These are the same on every page, in every email and in the Privacy Policy and Terms. They are changed in the site&rsquo;s code, not here, so the legal pages can never disagree with the rest of the site. Ask for a change and it goes out everywhere at once.</p>
      </section>

      <section className="admin-group" aria-labelledby="settings-prices">
        <h2 id="settings-prices">Plan prices</h2>
        {plans === null ? (
          <p className="admin-empty">Could not load the plans. Refresh to try again.</p>
        ) : (
          <dl className="admin-facts">
            {plans.map((plan) => (
              <div key={plan.code}>
                <dt>{plan.name}{plan.isPublic ? "" : " (not public)"}</dt>
                <dd>{plan.kind === "commission" ? `${plan.commissionBps / 100}% of bookings PortPass brings` : plan.monthlyCents > 0 ? `${formatPriceCents(plan.monthlyCents, { currency: false })} a month` : "No monthly price"}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="admin-form-note"><Link className="admin-inline-link" href="/admin/settings/prices">Change prices, features and badges</Link>. /pricing, /business and the setup steps all read from there.</p>
      </section>

      <section className="admin-group" aria-labelledby="settings-legal">
        <h2 id="settings-legal">Legal pages</h2>
        <dl className="admin-facts">
          <div><dt>Privacy Policy</dt><dd>Version {PRIVACY_POLICY.version}, last updated {legalDate(PRIVACY_POLICY.updated)} · <Link className="admin-inline-link" href="/privacy">Open</Link></dd></div>
          <div><dt>Terms of Service</dt><dd>Version {TERMS_OF_SERVICE.version}, last updated {legalDate(TERMS_OF_SERVICE.updated)} · <Link className="admin-inline-link" href="/terms">Open</Link></dd></div>
        </dl>
        <p className="admin-form-note">A new account records the versions it signed up under. The list of changes is at the bottom of each page.</p>
      </section>

      <section className="admin-group" aria-labelledby="settings-switches">
        <h2 id="settings-switches">What is switched on</h2>
        <p className="admin-form-note">{off === 0 ? "Everything is set." : `${off} not set yet.`} Each row names the settings it needs in Vercel. Their values are never shown here or anywhere on the site.</p>
        <table className="admin-table">
          <thead><tr><th>Feature</th><th>State</th><th>Needs (in Vercel)</th><th>What it does</th></tr></thead>
          <tbody>
            {switches.map((s) => (
              <tr key={s.label}>
                <td data-label="Feature"><strong>{s.label}</strong></td>
                <td data-label="State"><span className={`admin-pill ${s.on ? "live" : "submitted"}`}>{s.on ? "On" : "Not set"}</span></td>
                <td data-label="Needs (in Vercel)">{s.needs.map((name) => <code key={name}>{name} </code>)}</td>
                <td data-label="What it does">{s.note}{s.label === "Founders' admin access" && s.on ? ` ${founders} address${founders === 1 ? "" : "es"} listed.` : ""}</td>
              </tr>
            ))}
            <tr>
              <td data-label="Feature"><strong>Continue with Google</strong></td>
              <td data-label="State"><span className={`admin-pill ${google ? "live" : ""}`}>{google ? "On" : "Off"}</span></td>
              <td data-label="Needs">Switched on in Supabase, under Authentication, Providers</td>
              <td data-label="What it does">The button on the sign-in screens. It stays hidden until Google is switched on.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
