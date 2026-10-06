import Link from "next/link";
import { listPublishedOrganizations } from "@/db/organizations";
import { getSiteContent } from "@/db/siteContent";
import { requireAdmin } from "@/lib/auth/admin";
import { ANNOUNCEMENT_MAX, LINK_LABEL_MAX, orderBySpotlight } from "@/lib/siteContent";
import { AdminShell } from "../_components/AdminShell";
import { ContentManager } from "./ContentManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Content | PortPass admin",
  robots: { index: false, follow: false },
};

// Admin -> Content (brief 08, 1.9): what a founder can change on the public
// site without code. The announcement bar, the order of the homepage's
// "Open now" cards, and a way to the prices (which have their own screen).
export default async function AdminContentPage() {
  const session = await requireAdmin("/admin/content");
  const [content, listed] = await Promise.all([getSiteContent({ fresh: true }), listPublishedOrganizations()]);
  const businesses = orderBySpotlight(listed, content.spotlight).map((business) => ({ slug: business.slug, name: business.name }));

  return (
    <AdminShell session={session} current="/admin/content" title="Content" lede="Change what the public site says without a deploy. Every change is logged and is live at once.">
      <ContentManager announcement={content.announcement} businesses={businesses} announcementMax={ANNOUNCEMENT_MAX} linkLabelMax={LINK_LABEL_MAX} motion={content.motion} />
      <section className="admin-group" aria-labelledby="content-prices">
        <h2 id="content-prices">Prices on /business and /pricing</h2>
        <p className="admin-form-note">Plan prices, features and badges are edited in <Link className="admin-inline-link" href="/admin/settings/prices">Prices</Link>. The pricing block on /business and the /pricing page both read from there.</p>
      </section>
    </AdminShell>
  );
}
