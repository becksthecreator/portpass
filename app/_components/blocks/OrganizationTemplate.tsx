import type { OrganizationListing } from "@/db/organizations";
import { IdentityBlock } from "./IdentityBlock";
import { ProofBlock } from "./ProofBlock";
import { GalleryBlock } from "./GalleryBlock";
import { OfferingsBlock } from "./OfferingsBlock";
import { PracticalBlock } from "./PracticalBlock";
import { PeopleBlock } from "./PeopleBlock";
import { QuestionsBlock } from "./QuestionsBlock";
import { ActionBlock } from "./ActionBlock";
import { MessageOnWhatsApp, ShareOnWhatsApp } from "./WhatsAppActions";
import { categoryLabel } from "./categoryLabel";
import { directoryHref } from "./directoryHref";
import { formatAgeRange } from "./format";
import { MemberPerkStrip } from "../perks/MemberPerkStrip";
import { InterestForm } from "../InterestForm";
import { bookPath, isBookable } from "@/lib/bookings/rules";
import { businessTheme, themeVars } from "@/lib/businessTheme";
import { isInterestCategory, type InterestCategory } from "@/lib/interestCategories";
import "./brand-theme.css";

// Renders any Organization page -- Futprep today, any future business
// tomorrow -- from the same eight blocks in the same fixed order: proof,
// then gallery, then prices, then the practical logistics, then people,
// then questions, then the action. A block with no data simply isn't
// rendered (each block enforces this itself); this template never fills a
// gap with placeholder copy.
//
// The page takes the business's own colours (lib/businessTheme.ts): its
// brand colour for buttons and badges, with text on them that always
// reads, and a brand-colour header with its logo while it has no photo.
// `enquiryForm`: a business with no WhatsApp number gets an "Enquire"
// button that opens a short form; a page with its own way to register
// (Futprep) turns it off.
// `registerHref`: the business has a class or camp open for registration
// (brief 18, D1), so the page's main button goes to its registration form.
// `share`: off for the demo business, which has no public page to share.
// `bookBase`: the page takes booking requests (brief 19, part A): every
// priced offering with no link of its own gets "Request to book", which
// goes to `${bookBase}/book?offering=<slug>`. Only the public page of a
// live business passes it; a preview or the demo doesn't.
export function OrganizationTemplate({ listing, enquiryForm = true, registerHref = null, share = true, bookBase = null }: { listing: OrganizationListing; enquiryForm?: boolean; registerHref?: string | null; share?: boolean; bookBase?: string | null }) {
  const { organization: org, offerings, images, faqs } = listing;

  const practicalFacts = offerings
    .filter((offering) => offering.scheduleText)
    .map((offering) => ({
      label: offering.name,
      value: [offering.scheduleText, formatAgeRange(offering.ageMin, offering.ageMax, offering.ageLabel)].filter(Boolean).join(" · "),
    }));

  const hasPricedOffering = offerings.some((offering) => offering.priceCents !== null);
  const enquire = enquiryForm && !org.whatsappE164;
  const enquiryCategory: InterestCategory = org.subcategory && isInterestCategory(org.subcategory) ? org.subcategory : org.primaryCategory && isInterestCategory(org.primaryCategory) ? org.primaryCategory : "entertainment";

  return (
    <main className="tpl-page tpl-themed" style={themeVars(businessTheme(org.brandColor, org.theme)) as React.CSSProperties}>
      <IdentityBlock
        name={org.name}
        category={categoryLabel(org.primaryCategory)}
        location={[org.area, org.island].filter(Boolean).join(", ") || null}
        isOpen
        heroImageUrl={org.heroImageUrl}
        layout={org.identityLayout ?? "overlay"}
        logoUrl={org.logoUrl}
        brandHeader
      />
      <ProofBlock
        yearsInBusiness={org.yearsInBusiness}
        rating={org.rating}
        reviewCount={org.reviewCount}
        awards={org.awards}
        reviewsUrl={org.reviewsUrl}
        reviewsPlatform={org.reviewsPlatform}
      />
      <GalleryBlock images={images} />
      {/* Member perks (brief 10): renders nothing unless the business has one live. */}
      <MemberPerkStrip slug={org.slug} path={directoryHref(org.slug, org.primaryCategory)} offerings={offerings} />
      <OfferingsBlock offerings={offerings} bookHref={bookBase ? (offering) => (isBookable(offering) ? bookPath(bookBase, offering.slug) : null) : undefined} />
      <PracticalBlock facts={practicalFacts} />
      <PeopleBlock name={org.ownerName} bio={org.ownerBio} imageUrl={org.ownerImageUrl} />
      <QuestionsBlock faqs={faqs} />
      <div className="tpl-whatsapp">
        {/* "Book on WhatsApp" only where the business has given a number;
            otherwise "Enquire" opens the form below (brief 18, G3). */}
        {org.whatsappE164 && <MessageOnWhatsApp e164={org.whatsappE164} businessName={org.name} org={org.slug} label="Book on WhatsApp" />}
        {enquire && <a className="tpl-button tpl-button-secondary" href="#enquire">Enquire <span aria-hidden="true">↓</span></a>}
        {share && <ShareOnWhatsApp url={`https://portpassbahamas.com${directoryHref(org.slug, org.primaryCategory)}`} text={`${org.name} on PortPass:`} org={org.slug} />}
      </div>
      {enquire && (
        <section className="tpl-enquire" id="enquire" aria-labelledby="tpl-enquire-title">
          <h2 id="tpl-enquire-title">Enquire with {org.name}</h2>
          <p>Leave your name and how to reach you. PortPass passes your enquiry to {org.name}.</p>
          <InterestForm
            category={enquiryCategory}
            placeholder="What would you like to book or ask?"
            defaultNote={`Enquiry for ${org.name}: `}
            submitLabel="Send enquiry →"
            doneTitle="Enquiry sent."
            doneText={`PortPass will pass it to ${org.name}, and you'll hear back by phone or email.`}
          />
        </section>
      )}
      {registerHref ? <ActionBlock label="Register for a class or camp" href={registerHref} /> : hasPricedOffering && <ActionBlock label={bookBase && offerings.some(isBookable) ? "See prices & request to book" : "See prices & get started"} href="#offerings" />}
    </main>
  );
}
