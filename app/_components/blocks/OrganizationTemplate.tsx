import type { OrganizationListing } from "@/db/organizations";
import { IdentityBlock } from "./IdentityBlock";
import { ProofBlock } from "./ProofBlock";
import { GalleryBlock } from "./GalleryBlock";
import { OfferingsBlock } from "./OfferingsBlock";
import { PracticalBlock } from "./PracticalBlock";
import { PeopleBlock } from "./PeopleBlock";
import { QuestionsBlock } from "./QuestionsBlock";
import { ActionBlock } from "./ActionBlock";
import { categoryLabel } from "./categoryLabel";
import { formatAgeRange } from "./format";
import { computeBrandTokens } from "./brand";

// Renders any Organization page -- Futprep today, any future business
// tomorrow -- from the same eight blocks in the same fixed order: proof,
// then gallery, then prices, then the practical logistics, then people,
// then questions, then the action. A block with no data simply isn't
// rendered (each block enforces this itself); this template never fills a
// gap with placeholder copy.
export function OrganizationTemplate({ listing }: { listing: OrganizationListing }) {
  const { organization: org, offerings, images, faqs } = listing;

  const practicalFacts = offerings
    .filter((offering) => offering.scheduleText)
    .map((offering) => ({
      label: offering.name,
      value: [offering.scheduleText, formatAgeRange(offering.ageMin, offering.ageMax)].filter(Boolean).join(" · "),
    }));

  const hasPricedOffering = offerings.some((offering) => offering.priceCents !== null);
  const { brand, brandText } = computeBrandTokens(org.brandColor);

  return (
    <main className="tpl-page" style={{ "--brand": brand, "--brand-text": brandText } as React.CSSProperties}>
      <IdentityBlock
        name={org.name}
        category={categoryLabel(org.primaryCategory)}
        location={[org.area, org.island].filter(Boolean).join(", ") || null}
        isOpen
        heroImageUrl={org.heroImageUrl}
      />
      <ProofBlock yearsInBusiness={org.yearsInBusiness} rating={org.rating} reviewCount={org.reviewCount} awards={org.awards} />
      <GalleryBlock images={images} />
      <OfferingsBlock offerings={offerings} />
      <PracticalBlock facts={practicalFacts} />
      <PeopleBlock name={org.ownerName} bio={org.ownerBio} imageUrl={org.ownerImageUrl} />
      <QuestionsBlock faqs={faqs} />
      {hasPricedOffering && <ActionBlock label="See prices & get started" href="#offerings" />}
    </main>
  );
}
