import { ApplicationForm } from "./ApplicationForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

const APPLY_TITLE = "Apply to list with PortPass | PortPass Bahamas";
const APPLY_DESCRIPTION = "Bring your club, academy, or business onto the same booking and payment system powering Futprep and Bahamas Weddings By The Sea.";

export const metadata = {
  title: APPLY_TITLE,
  description: APPLY_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "PortPass Bahamas",
    title: APPLY_TITLE,
    description: APPLY_DESCRIPTION,
    url: "https://portpassbahamas.com/apply",
  },
  twitter: {
    card: "summary_large_image",
    title: APPLY_TITLE,
    description: APPLY_DESCRIPTION,
  },
};

export default function ApplyPage() {
  return (
    <main className="form-page">
      <SiteHeader />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />PortPass early access</div>
        <h1>Tell us about your organization.</h1>
        <p>We&apos;re welcoming the first group of Bahamian clubs, academies, and sports organizations.</p>
        <p className="apply-pricing-note">Free while we onboard our first businesses — pricing is shared on your call, before you commit to anything.</p>
      </section>
      <ApplicationForm />
      <SiteFooter />
    </main>
  );
}
