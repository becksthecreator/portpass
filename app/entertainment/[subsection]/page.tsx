import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterestForm } from "@/app/_components/InterestForm";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { entertainmentSubsection } from "../subsections";

type Params = Promise<{ subsection: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subsection: slug } = await params;
  const subsection = entertainmentSubsection(slug);
  if (!subsection) return {};
  return {
    title: `${subsection.name} in The Bahamas | PortPass Bahamas`,
    description: `${subsection.blurb} Coming soon to PortPass.`,
    robots: { index: false, follow: true },
  };
}

export default async function EntertainmentSubsectionPage({ params }: { params: Params }) {
  const { subsection: slug } = await params;
  const subsection = entertainmentSubsection(slug);
  if (!subsection) notFound();

  return (
    <main className="form-page">
      <SiteHeader
        breadcrumb={[
          { label: "Entertainment", href: "/entertainment" },
          { label: subsection.name, href: `/entertainment/${subsection.slug}` },
        ]}
      />
      <section className="form-intro">
        <div className="eyebrow"><span className="eyebrow-dot" />Entertainment &middot; {subsection.name}</div>
        <h1>{subsection.headline}</h1>
        <p>{subsection.blurb} Tell us what you&rsquo;re looking for and we&rsquo;ll reach out when it opens.</p>
      </section>
      <InterestForm category={subsection.slug} placeholder={subsection.placeholder} />
      <SiteFooter />
    </main>
  );
}
