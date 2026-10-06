import Link from "next/link";
import { notFound } from "next/navigation";
import { OrganizationTemplate } from "@/app/_components/blocks/OrganizationTemplate";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { bizDisplay, ppSans } from "@/app/fonts";
import { getOrganizationListingForPreview } from "@/db/organizations";
import { requireDemo } from "@/lib/auth/demo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Booking page | Demo business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// The demo's booking page (brief 18, part B): the same template every
// business's public page uses, in the demo's colours. It is shown only
// here: the demo has no public page, and no WhatsApp, enquiry or share
// button that would reach anyone.
export default async function DemoBookingPage() {
  const { org } = await requireDemo();
  const listing = await getOrganizationListingForPreview(org.id);
  if (!listing) notFound();

  return (
    <div className={`${bizDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Demo business", href: "/demo/home" }, { label: "Booking page", href: "/demo/booking" }]} />
      <OrganizationTemplate listing={listing} enquiryForm={false} share={false} />
      <div className="demo-note-wrap">
        <p className="demo-note">
          <strong>On a real page</strong> the main button opens the registration form or WhatsApp, in the business&rsquo;s own colours. In the demo those are switched off, so nothing reaches anyone. What a registration looks like once it arrives is in <Link href="/demo/registrations">Registrations</Link>.
        </p>
      </div>
      <SiteFooter orgLine={`${org.name} · Booking and payments powered by PortPass`} />
    </div>
  );
}
