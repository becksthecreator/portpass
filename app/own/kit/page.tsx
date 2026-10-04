import Link from "next/link";
import { listPublishedOrganizations } from "@/db/organizations";
import "@/app/_components/event/event.css";
import { requirePlatformRole } from "@/lib/auth/guards";
import { cleanEventCode, eventName, OWN_EVENT } from "@/lib/eventSignup";
import { encodeText, qrToSvg } from "@/lib/qr";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign-up kit | PortPass Bahamas",
  robots: { index: false, follow: false },
};

const SITE = "https://portpassbahamas.com";

// The codes are drawn here, by lib/qr.ts: nothing is fetched from a third
// party, and they print sharp at any size.
function Qr({ url }: { url: string }) {
  return <div className="kit-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qrToSvg(encodeText(url, "M"), { border: 2 }) }} />;
}

// /own/kit (brief 18, C2): one A4 sheet for the stall, for platform owners.
// Three codes: the 30-second sign-up form, the demo business, and "Book
// [Business] on PortPass" for a business that is already live (choose one,
// or print the blank template). ?event=<code> prints the sheet for the
// next event's /join/<code> form.
export default async function SignupKitPage({ searchParams }: { searchParams: Promise<{ event?: string; business?: string }> }) {
  await requirePlatformRole("platform_owner", "/own/kit");
  const params = await searchParams;
  const event = cleanEventCode(params.event) ?? OWN_EVENT;
  const signupPath = event === OWN_EVENT ? "/own" : `/join/${event}`;
  const businesses = (await listPublishedOrganizations().catch(() => [])).filter((b) => b.primaryCategory);
  const chosen = businesses.find((b) => b.slug === params.business) ?? null;
  const bookPath = chosen ? `/${chosen.primaryCategory}/${chosen.slug}` : null;

  return (
    <main className="kit-page">
      <div className="kit-tools">
        <PrintButton />
        <form method="get" action="/own/kit">
          {event !== OWN_EVENT && <input type="hidden" name="event" value={event} />}
          <label htmlFor="kit-business">Business for the third code</label>
          <select id="kit-business" name="business" defaultValue={chosen?.slug ?? ""}>
            <option value="">Blank template</option>
            {businesses.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
          <button type="submit">Show</button>
        </form>
        <Link href="/admin/leads">Leads</Link>
      </div>

      <div className="kit-sheet">
        <h1>Get your business on PortPass.</h1>
        <p>Your prices, your photos and a booking button in one link. Customers pay you directly. Scan a code with your phone camera.</p>
        <div className="kit-grid">
          <section className="kit-card">
            <h2>Sign up in 30 seconds</h2>
            <Qr url={`${SITE}${signupPath}`} />
            <p>Your name, your business and your WhatsApp number. We build the page with you.</p>
            <code>portpassbahamas.com{signupPath}</code>
          </section>
          <section className="kit-card">
            <h2>Try a demo business</h2>
            <Qr url={`${SITE}/demo`} />
            <p>See what a business sees: registrations, payment requests and attendance. Example data only.</p>
            <code>portpassbahamas.com/demo</code>
          </section>
          <section className="kit-card">
            <h2>Book {chosen ? chosen.name : "[Business]"} on PortPass</h2>
            {bookPath ? <Qr url={`${SITE}${bookPath}`} /> : <div className="kit-blank" aria-hidden="true">Your code goes here</div>}
            <p>{chosen ? "Prices, photos and how to book, in one place." : "Every business on PortPass gets its own code like this, for its counter, flyers and Instagram."}</p>
            <code>{bookPath ? `portpassbahamas.com${bookPath}` : "portpassbahamas.com/[section]/[business]"}</code>
          </section>
        </div>
        <p className="kit-foot">{eventName(event)} · PortPass Bahamas · portpassbahamas.com</p>
      </div>
    </main>
  );
}
