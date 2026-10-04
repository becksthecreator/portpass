// @public-route: "Tell us what you need", linked from the homepage's "Coming next" row.
import { InterestForm, type InterestChoice } from "@/app/_components/InterestForm";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { liveCountsByCategory } from "@/db/organizations";
import { isInterestCategory } from "@/lib/interestCategories";
import { getSectionOptions } from "@/lib/navSections";

export const revalidate = 300;

export const metadata = {
  title: "Tell us what you need | PortPass Bahamas",
  description: "Looking for something in Nassau that isn't on PortPass yet? Tell us and we'll let you know when it opens.",
  // A form, not a page to find in search results.
  robots: { index: false, follow: true },
};

// One form for every section that isn't open yet (brief 18, A1): pick the
// section, say what you're looking for. It is saved with the same interest
// submissions the section pages collect, so it shows in the same list.
export default async function TellUsPage() {
  const [sections, live] = await Promise.all([getSectionOptions(), liveCountsByCategory().catch(() => new Map<string, number>())]);
  // Sections that aren't open yet come first: they are what the link is for.
  const ordered = [...sections].sort((a, b) => Number((live.get(a.slug) ?? 0) > 0) - Number((live.get(b.slug) ?? 0) > 0));
  const choices: InterestChoice[] = ordered.map((section) => ({ label: section.name, category: isInterestCategory(section.slug) ? section.slug : "entertainment" }));

  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Tell us what you need", href: "/tell-us" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Coming next</div>
        <h1>Tell us what you need.</h1>
        <p>More of The Bahamas is joining PortPass every week. Say what you&rsquo;re looking for and we&rsquo;ll let you know when it opens. We&rsquo;ll only contact you about this.</p>
      </section>
      <InterestForm category="entertainment" choices={choices} placeholder="What would you book? (optional)" />
      <SiteFooter />
    </main>
  );
}
