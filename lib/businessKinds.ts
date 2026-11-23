import { isSectionSlug, type SectionSlug } from "@/lib/sections";

// What kind of business is asking for a First Look (/apply, 23 Nov 2026).
// PortPass is for any Bahamian business now ("A new set of eyes for your
// business"), and the site's sections only cover some of them, so the form
// asks in everyday words. Each kind maps to a section where one fits (so a
// lead and an approved listing land in the right place); the rest have no
// section and are kept in words, in applications.activity_type.

export type BusinessKind = { value: string; label: string; section: SectionSlug | null };

export const BUSINESS_KINDS: readonly BusinessKind[] = [
  { value: "sports-fitness", label: "Sports, fitness or a gym", section: "sports-fitness" },
  { value: "events-weddings", label: "Events or weddings", section: "weddings" },
  { value: "venue", label: "A venue", section: "venues" },
  { value: "salon-beauty", label: "Salon, barber or beauty", section: null },
  { value: "wellness", label: "Wellness, spa or therapy", section: null },
  { value: "food-drink", label: "Food and drink (restaurant, caterer, bakery)", section: null },
  { value: "tours", label: "Tours, boats or activities", section: "tours" },
  { value: "schools", label: "School, tutoring or a camp", section: null },
  { value: "entertainment", label: "Entertainment or nightlife", section: "entertainment" },
  { value: "shop", label: "A shop or a Bahamian brand", section: "shop" },
  { value: "services", label: "Home or trade services (cleaning, repairs, trades)", section: "services" },
  { value: "other", label: "Something else", section: null },
];

export const OTHER_KIND = "other";
export const OTHER_MAX = 60;

// The kind for an old link that names a section (?section=venues).
export function kindForSection(section: string | null | undefined): string {
  return BUSINESS_KINDS.find((kind) => kind.section !== null && kind.section === section)?.value ?? "";
}

export type ResolvedKind = { ok: true; section: SectionSlug | null; activityType: string } | { ok: false; error: string };

// The form's answer, checked. "Something else" needs a few words; anything
// not on the list is refused. A request from an older page that sends only
// a known section still works.
export function resolveBusinessKind(kindRaw: string, otherRaw: string, legacySection = ""): ResolvedKind {
  const kind = BUSINESS_KINDS.find((entry) => entry.value === kindRaw);
  if (!kind) {
    if (!kindRaw && legacySection && isSectionSlug(legacySection)) {
      const fromSection = BUSINESS_KINDS.find((entry) => entry.section === legacySection);
      return { ok: true, section: legacySection, activityType: fromSection?.label ?? legacySection };
    }
    return { ok: false, error: "Choose what kind of business you run." };
  }
  if (kind.value === OTHER_KIND) {
    const other = otherRaw.replace(/\s+/g, " ").trim().slice(0, OTHER_MAX);
    if (other.length < 2) return { ok: false, error: "Tell us what kind of business it is, in a few words." };
    return { ok: true, section: null, activityType: `Other: ${other}` };
  }
  return { ok: true, section: kind.section, activityType: kind.label };
}
