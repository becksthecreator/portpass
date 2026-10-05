// "What your page is missing" (brief 19, part D): the nine things a
// business's page should have, each worked out from the data and each
// with a link to where it is fixed. Pure: the facts come from
// db/pageChecklist.ts, and the same list is drawn on the business's home,
// in Admin -> Businesses and on Admin -> Phase 1.

export const PHOTO_TARGET = 5;

// What is true of one business right now.
export type PageFacts = {
  slug: string;
  // A hero photo the public page actually shows (where a business's
  // photos may include children, only one with consent confirmed).
  hasHero: boolean;
  // Gallery photos the public page shows.
  photos: number;
  // Offerings with a price, and those of them that are published.
  pricedOfferings: number;
  openOfferings: number;
  // Classes or camps open for registration today.
  openProgrammes: number;
  hasWhatsApp: boolean;
  hasInstagram: boolean;
  hasGoogleBusiness: boolean;
  // The Get paid step is finished: a method chosen, with its details.
  getPaidDone: boolean;
  livePerks: number;
};

export const CHECKLIST_KEYS = ["hero", "photos", "price", "whatsapp", "instagram", "get_paid", "perk", "google", "open"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export type ChecklistItem = {
  key: ChecklistKey;
  // The thing, in two or three words (the table's column heading).
  label: string;
  done: boolean;
  // What to do, when it isn't done; what is there, when it is.
  detail: string;
  // Where it is fixed.
  href: string;
  action: string;
};

export function pageChecklist(facts: PageFacts): ChecklistItem[] {
  const base = `/business/${facts.slug}`;
  const settings = (step: number) => `${base}/settings?step=${step}`;
  const morePhotos = PHOTO_TARGET - facts.photos;
  const open = facts.openProgrammes + facts.openOfferings;
  return [
    {
      key: "hero",
      label: "Hero photo",
      done: facts.hasHero,
      detail: facts.hasHero ? "Your page opens with your photo." : "Add the photo your page opens with. Without one, visitors see your colour and logo.",
      href: settings(3),
      action: "Add a hero photo",
    },
    {
      key: "photos",
      label: `${PHOTO_TARGET} photos`,
      done: facts.photos >= PHOTO_TARGET,
      detail: facts.photos >= PHOTO_TARGET ? `${facts.photos} photos in your gallery.` : facts.photos === 0 ? `Add ${PHOTO_TARGET} photos. Pages with a gallery get more enquiries.` : `${facts.photos} so far. Add ${morePhotos} more to reach ${PHOTO_TARGET}.`,
      href: settings(3),
      action: "Add photos",
    },
    {
      key: "price",
      label: "A price",
      done: facts.pricedOfferings > 0,
      detail: facts.pricedOfferings > 0 ? `${facts.pricedOfferings} ${facts.pricedOfferings === 1 ? "offering has" : "offerings have"} a price.` : "Put a price on at least one thing you offer. A page with no price can't go live.",
      href: settings(4),
      action: "Add a price",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      done: facts.hasWhatsApp,
      detail: facts.hasWhatsApp ? "Customers can message you on WhatsApp." : "Add your WhatsApp number so customers can message you from your page.",
      href: settings(2),
      action: "Add your WhatsApp number",
    },
    {
      key: "instagram",
      label: "Instagram",
      done: facts.hasInstagram,
      detail: facts.hasInstagram ? "Your Instagram is linked." : "Add your Instagram handle. It helps people and search engines know the page is yours.",
      href: settings(2),
      action: "Add your Instagram",
    },
    {
      key: "get_paid",
      label: "Get paid",
      done: facts.getPaidDone,
      detail: facts.getPaidDone ? "Customers know how to pay you." : "Say how customers pay you (cash, bank transfer or a Kanoo wallet transfer). You need this to send a payment request.",
      href: settings(5),
      action: "Finish Get paid",
    },
    {
      key: "perk",
      label: "A member perk",
      done: facts.livePerks > 0,
      detail: facts.livePerks > 0 ? `${facts.livePerks} ${facts.livePerks === 1 ? "perk is" : "perks are"} live for PortPass members.` : "Offer PortPass members one perk. It puts your page on the Perks page.",
      href: `${base}/perks`,
      action: "Offer a perk",
    },
    {
      key: "google",
      label: "Google link",
      done: facts.hasGoogleBusiness,
      detail: facts.hasGoogleBusiness ? "Your Google Business Profile is linked." : "Add your Google Business Profile link, so you can ask customers for Google reviews.",
      href: settings(2),
      action: "Add your Google link",
    },
    {
      key: "open",
      label: "Something open",
      done: open > 0,
      detail:
        open > 0
          ? [facts.openProgrammes > 0 ? `${facts.openProgrammes} ${facts.openProgrammes === 1 ? "class or camp is" : "classes or camps are"} open for registration` : "", facts.openOfferings > 0 ? `${facts.openOfferings} priced ${facts.openOfferings === 1 ? "offering is" : "offerings are"} published` : ""].filter(Boolean).join(", ") + "."
          : "Nothing can be booked yet. Publish a priced offering here, or open a class or camp under Registrations.",
      href: settings(4),
      action: "Publish an offering",
    },
  ];
}

export function missingItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((item) => !item.done);
}

// "Nothing missing", "1 thing to add", "4 things to add".
export function checklistSummary(items: ChecklistItem[]): string {
  const missing = missingItems(items).length;
  return missing === 0 ? "Nothing missing" : `${missing} ${missing === 1 ? "thing" : "things"} to add`;
}
