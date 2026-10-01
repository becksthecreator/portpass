// The published versions of PortPass's legal pages (brief 16 D, brief 07).
// /privacy and /terms read their version, date and list of changes from
// here, and a new account records these versions as the ones it agreed to
// (profiles.terms_version / privacy_version), so the page header, the
// changelog at the bottom and the record of acceptance always agree.
//
// To publish a change: edit the page, add an entry at the top of that
// document's changelog, and set `updated` (and `version` when the meaning
// changes, not for a typo). The wording that comes back from the
// attorney's review is published as a new version, never as an edit to
// this one, so the version a person agreed to always names the wording.

export type LegalChange = { version: number; date: string; changes: string[] };

export type LegalDocument = {
  version: number;
  // ISO date the current version was last edited.
  updated: string;
  // Newest first.
  changelog: LegalChange[];
};

export const PRIVACY_POLICY: LegalDocument = {
  version: 2,
  updated: "2026-10-01",
  changelog: [
    {
      version: 2,
      date: "2026-10-01",
      changes: [
        "Names the law this policy follows: the Data Protection (Privacy of Personal Information) Act, and the Data Protection Act, 2025 once it is in force.",
        "Adds PortPass accounts and signing in with Google: what Google shares with us, and that PortPass never posts to Google.",
        "Adds a full section on children's information: what is collected, who can see health details, and photos.",
        "Sets how long we keep things: children's health details for 90 days after the programme ends, payment records for 7 years, enquiries for 2 years.",
        "Lists the companies that handle information for us, and says it is stored in the United States.",
        "Lists the cookies PortPass sets and what is kept on your device, and corrects the analytics section.",
        "Adds how to have your account deleted and how to complain to the Data Protection Commissioner.",
        "Explains that we record how you found a business, and what that is used for.",
        "Says how we invite businesses to PortPass, and what we keep about a business that asks not to be contacted.",
        "Says we answer requests about your information within 40 days.",
        "Says we count views and button taps on a business's public pages for its growth report, with no names or internet addresses.",
      ],
    },
    { version: 1, date: "2026-09-01", changes: ["First published."] },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  version: 2,
  updated: "2026-10-01",
  changelog: [
    {
      version: 2,
      date: "2026-10-01",
      changes: [
        "Adds PortPass accounts and what you agree to when you create one.",
        "Adds children's programmes: who may register a child, and what the registering adult confirms.",
        "Describes payments as they work today: cash or bank transfer paid to the business. PortPass takes no card payments and holds no money.",
        "Sets out the booking rules for registrations, waitlists, free tasters, private-session requests and enquiries.",
        "Sets out what a business agrees to when it lists on PortPass: review, plans and fees, customers' information, photos and its team.",
        "Says where ratings come from: PortPass does not collect reviews.",
        "Changes what PortPass is responsible for: see \"Our responsibility to you\".",
        "Says the courts of The Bahamas decide any dispute, that accounts are for people aged 18 or over, and that the Privacy Policy forms part of these terms.",
      ],
    },
    { version: 1, date: "2026-09-01", changes: ["First published."] },
  ],
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-01" becomes "1 October 2026"; version 1 was dated by month only.
export function legalDate(iso: string, monthOnly = false): string {
  const [year, month, day] = iso.split("-").map(Number);
  const name = MONTHS[month - 1] ?? "";
  return monthOnly ? `${name} ${year}` : `${day} ${name} ${year}`;
}

export function legalHeading(doc: LegalDocument): string {
  return `Version ${doc.version} · last updated ${legalDate(doc.updated)}`;
}
