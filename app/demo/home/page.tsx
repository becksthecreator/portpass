import Link from "next/link";
import { requireDemo } from "@/lib/auth/demo";
import { hasPlatformRole } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { DemoFrame } from "../DemoFrame";
import { ResetDemoButton } from "./ResetDemoButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The demo dashboard (brief 18, part B): the business home a real owner
// sees, for the made-up business. Every card stays inside /demo.
export default async function DemoHomePage() {
  const { org } = await requireDemo();
  // The reset button is for PortPass platform owners; everyone else gets
  // the nightly reset.
  const session = await getSession().catch(() => null);
  const owner = session ? hasPlatformRole(session, "platform_owner") : false;
  const resetDay = org.resetAt ? new Date(org.resetAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Nassau" }) : null;

  return (
    <DemoFrame>
      <div className="eyebrow"><span className="eyebrow-dot" />Demo</div>
      <h1>{org.name}</h1>
      <p className="auth-lead">This is what a business sees when it signs in to PortPass. Every family, payment and phone number here is made up. Press anything.</p>

      <div className="biz-home-grid">
        <Link className="chooser-card" href="/demo/booking"><strong>Booking page</strong><span>What customers see: prices, times, how to book</span><b>Open →</b></Link>
        <Link className="chooser-card" href="/demo/registrations"><strong>Registrations</strong><span>Classes, and who has registered</span><b>Open →</b></Link>
        <Link className="chooser-card" href="/demo/payments"><strong>Payment requests</strong><span>Request payment, mark paid, send the receipt</span><b>Open →</b></Link>
        <Link className="chooser-card" href="/demo/payments/chase"><strong>Chase list</strong><span>Who is overdue, oldest first</span><b>Open →</b></Link>
        <Link className="chooser-card" href="/demo/attendance"><strong>Attendance</strong><span>Mark who came to each session</span><b>Open →</b></Link>
        <Link className="chooser-card" href="/demo/growth"><strong>Growth report</strong><span>Found you, asked, booked, paid, showed up</span><b>Open →</b></Link>
      </div>

      <section className="account-section">
        <h2>Things to try</h2>
        <ol className="demo-try">
          <li>Open <Link href="/demo/registrations">Registrations</Link>, pick a family that owes a fee and press <strong>Request payment</strong>.</li>
          <li>Press a send button. The request is marked as sent, and the screen says &ldquo;Demo: nothing was sent&rdquo;.</li>
          <li>Open the customer&rsquo;s page from the request, then come back and press <strong>Record payment</strong>. A receipt appears.</li>
          <li>Open <Link href="/demo/attendance">Attendance</Link> and mark the register that hasn&rsquo;t been done.</li>
        </ol>
      </section>

      {owner && (
        <div className="demo-reset">
          <p><strong>Platform owners only.</strong> Put the demo back to its starting point now.{resetDay ? ` Last reset: ${resetDay}.` : ""}</p>
          <ResetDemoButton />
        </div>
      )}
      <p className="auth-hint">The example data is put back every night{resetDay ? `; this set is from ${resetDay}` : ""}.</p>

      <form className="demo-leave" method="post" action="/demo/exit">
        <button type="submit">Leave the demo</button>
      </form>
      <p className="auth-alt">Want this for your business? <Link href="/own">Sign up in 30 seconds →</Link></p>
    </DemoFrame>
  );
}
