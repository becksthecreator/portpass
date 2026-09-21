import type { OfferingListing } from "@/db/organizations";
import { IdentityBlock } from "./IdentityBlock";
import { ProofBlock } from "./ProofBlock";
import { GalleryBlock } from "./GalleryBlock";
import { OfferingsBlock } from "./OfferingsBlock";
import { PracticalBlock } from "./PracticalBlock";
import { PeopleBlock } from "./PeopleBlock";
import { QuestionsBlock } from "./QuestionsBlock";
import { ActionBlock } from "./ActionBlock";
import { categoryLabel } from "./categoryLabel";
import { OFFERING_ACTION_LABEL, formatAgeRange, formatDate } from "./format";

// Renders a single offering's own page. The brief names four separate
// templates here -- Program, Event, Venue, Service -- but all four are the
// same eight blocks in the same fixed order, scoped to one offering instead
// of the whole organization; the only thing that varies between them is
// which optional fields on that one offering are populated, which each
// block already handles by not rendering what's absent. Building four
// near-identical files would reintroduce exactly the duplication this
// system exists to remove, so there's one real implementation
// (OfferingTemplate) with a named export per type below for call-site
// clarity and so each type has its own component to point at, the way the
// brief's acceptance checks expect.
//
// This is also the SEO surface: a parent searching "football for 3 year
// olds Nassau" should be able to land directly here.
export function OfferingTemplate({ listing }: { listing: OfferingListing }) {
  const { organization: org, offering, images, faqs } = listing;

  const practicalFacts: { label: string; value: string }[] = [];
  if (offering.scheduleText) practicalFacts.push({ label: "When", value: offering.scheduleText });
  const ageRange = formatAgeRange(offering.ageMin, offering.ageMax);
  if (ageRange) practicalFacts.push({ label: "Who it's for", value: ageRange });
  if (offering.capacity) practicalFacts.push({ label: "Spots per session", value: String(offering.capacity) });
  if (offering.termStart && offering.termEnd) {
    practicalFacts.push({ label: "Term dates", value: `${formatDate(offering.termStart)} – ${formatDate(offering.termEnd)}` });
  }
  if (offering.eventDate) practicalFacts.push({ label: "Date", value: formatDate(offering.eventDate) });
  if (offering.doorsTime) practicalFacts.push({ label: "Doors", value: offering.doorsTime });
  if (offering.leadTimeText) practicalFacts.push({ label: "Lead time", value: offering.leadTimeText });

  return (
    <main className="tpl-page">
      <IdentityBlock
        name={offering.name}
        category={categoryLabel(org.primaryCategory)}
        location={[org.area, org.island].filter(Boolean).join(", ") || null}
        isOpen
        heroImageUrl={offering.imageUrl ?? org.heroImageUrl}
      />
      <ProofBlock yearsInBusiness={org.yearsInBusiness} rating={org.rating} reviewCount={org.reviewCount} awards={org.awards} />
      <GalleryBlock images={images} />
      <OfferingsBlock offerings={[offering]} />
      <PracticalBlock facts={practicalFacts} />
      <PeopleBlock name={org.ownerName} bio={org.ownerBio} imageUrl={org.ownerImageUrl} />
      <QuestionsBlock faqs={faqs} />
      {offering.actionUrl && (
        <ActionBlock label={`${OFFERING_ACTION_LABEL[offering.type]} for ${offering.name}`} href={offering.actionUrl} />
      )}
    </main>
  );
}

export const ProgramTemplate = OfferingTemplate;
export const EventTemplate = OfferingTemplate;
export const VenueTemplate = OfferingTemplate;
export const ServiceTemplate = OfferingTemplate;
