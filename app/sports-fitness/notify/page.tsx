import { listCategoryOrganizations } from "@/db/organizations";
import { InterestForm } from "@/app/_components/InterestForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Get notified | Sports & Fitness | PortPass Bahamas",
  description: "Be first to know when a sports or fitness business opens for booking on PortPass.",
  robots: { index: false, follow: true },
};

// Linked from a category page's "Coming soon · Get notified" card. The
// business is looked up by slug so the note is pre-filled with its real
// name; an unknown or missing slug just gives the generic version.
export default async function SportsFitnessNotifyPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  const { business } = await searchParams;
  const orgs = business ? await listCategoryOrganizations("sports-fitness").catch(() => []) : [];
  const name = orgs.find((org) => org.slug === business)?.name ?? null;

  return (
    <main className="form-page">
      <SiteHeader breadcrumb={[{ label: "Sports & Fitness", href: "/sports-fitness" }, { label: "Get notified", href: "/sports-fitness/notify" }]} />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Sports &amp; Fitness</div>
        <h1>{name ? `${name} is coming soon.` : "More sports and fitness is on the way."}</h1>
        <p>Leave a name, email or phone and we&rsquo;ll let you know the moment {name ?? "it"} opens for booking on PortPass.</p>
      </section>
      <InterestForm
        category="sports-fitness"
        placeholder="Anything in particular you're looking for? (optional)"
        defaultNote={name ? `Notify me when ${name} opens for booking.` : ""}
      />
      <SiteFooter />
    </main>
  );
}
