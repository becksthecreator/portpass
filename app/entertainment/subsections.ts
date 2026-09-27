import type { InterestCategory } from "@/lib/interestCategories";

// Hard-coded on purpose for the conference: the accounts brief moves
// sections and subsections into a `categories` table, at which point this
// file goes away. Each slug doubles as the interest-form category, so it
// must exist in lib/interestCategories.ts too.
export type EntertainmentSubsection = {
  slug: Extract<InterestCategory, "events" | "djs" | "sound-equipment">;
  name: string;
  headline: string;
  blurb: string;
  placeholder: string;
};

export const ENTERTAINMENT_SUBSECTIONS: EntertainmentSubsection[] = [
  {
    slug: "events",
    name: "Events",
    headline: "Events are on their way.",
    blurb: "Ticketed nights, parties and shows across The Bahamas, with scanning at the door.",
    placeholder: "What kind of event are you looking for? (optional)",
  },
  {
    slug: "djs",
    name: "DJs",
    headline: "DJs are on their way.",
    blurb: "DJs for weddings, parties, corporate nights and everything in between.",
    placeholder: "Tell us the date and the vibe you want (optional)",
  },
  {
    slug: "sound-equipment",
    name: "Sound Equipment",
    headline: "Sound equipment is on its way.",
    blurb: "Speakers, PA systems, lighting and AV hire, delivered and set up.",
    placeholder: "What do you need, and for when? (optional)",
  },
];

export function entertainmentSubsection(slug: string): EntertainmentSubsection | null {
  return ENTERTAINMENT_SUBSECTIONS.find((s) => s.slug === slug) ?? null;
}
