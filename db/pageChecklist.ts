import { pageChecklist, type ChecklistItem, type PageFacts } from "@/lib/pageChecklist";
import { getPaidProblem } from "@/lib/paymentRequests/rules";
import { getPaymentSettings } from "./paymentRequests";
import { listFutprepOffers } from "./registrations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// "What your page is missing" (brief 19, part D), read from the data: the
// facts lib/pageChecklist.ts turns into the nine-item list. One business
// for its own home page, or every business for the admin table. The demo
// business is example data and is never listed.
//
// Photos are counted the way the public page shows them: where a
// business's photos may include children, only those with consent
// confirmed (db/organizations.ts, withPhotoConsent).

type Row = Record<string, unknown>;

export type BusinessChecklist = {
  organizationId: number;
  slug: string;
  name: string;
  status: string;
  isPublished: boolean;
  items: ChecklistItem[];
};

const ORG_COLUMNS = "id,slug,name,status,is_published,hero_image_url,whatsapp_e164,instagram_handle,google_business_url,photo_consent_required";
const has = (value: unknown) => typeof value === "string" && value.trim().length > 0;

async function checklistsFor(orgs: Row[]): Promise<BusinessChecklist[]> {
  const listed = orgs.filter((org) => has(org.slug));
  if (listed.length === 0) return [];
  const ids = listed.map((org) => Number(org.id));
  const db = getSupabaseAdmin();
  const [images, offerings, perks, settings, programmes] = await Promise.all([
    db.from("organization_images").select("organization_id,consent_confirmed").in("organization_id", ids),
    db.from("offerings").select("organization_id,price_cents,is_published").in("organization_id", ids),
    db.from("member_perks").select("organization_id").eq("status", "live").in("organization_id", ids),
    // A business that hasn't opened Get paid has no row: not done.
    Promise.all(ids.map((id) => getPaymentSettings(id).catch(() => null))),
    // Decoration: a failed read counts as nothing open, as on the public page.
    Promise.all(ids.map((id) => listFutprepOffers({ publicOnly: true, organizationId: id }).then((offers) => offers.length).catch(() => 0))),
  ]);
  throwIfSupabaseError(images.error, "Could not count photos");
  throwIfSupabaseError(offerings.error, "Could not count offerings");
  throwIfSupabaseError(perks.error, "Could not count perks");

  return listed.map((org, index) => {
    const id = Number(org.id);
    const consentRequired = Boolean(org.photo_consent_required);
    const mine = ((images.data ?? []) as Row[]).filter((image) => Number(image.organization_id) === id);
    const shown = consentRequired ? mine.filter((image) => Boolean(image.consent_confirmed)) : mine;
    const priced = ((offerings.data ?? []) as Row[]).filter((offering) => Number(offering.organization_id) === id && offering.price_cents !== null && offering.price_cents !== undefined);
    const facts: PageFacts = {
      slug: String(org.slug),
      // Where consent is required the page falls back to the first
      // consented photo, so any consented photo gives it a hero.
      hasHero: consentRequired ? shown.length > 0 : has(org.hero_image_url),
      photos: shown.length,
      pricedOfferings: priced.length,
      openOfferings: priced.filter((offering) => Boolean(offering.is_published)).length,
      openProgrammes: programmes[index],
      hasWhatsApp: has(org.whatsapp_e164),
      hasInstagram: has(org.instagram_handle),
      hasGoogleBusiness: has(org.google_business_url),
      getPaidDone: getPaidProblem(settings[index]) === null,
      livePerks: ((perks.data ?? []) as Row[]).filter((perk) => Number(perk.organization_id) === id).length,
    };
    return { organizationId: id, slug: facts.slug, name: String(org.name ?? ""), status: String(org.status ?? "draft"), isPublished: Boolean(org.is_published), items: pageChecklist(facts) };
  });
}

// One business's list, for its own home page.
export async function getBusinessChecklist(organizationId: number): Promise<BusinessChecklist | null> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select(ORG_COLUMNS).eq("id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the business");
  if (!data) return null;
  return (await checklistsFor([data as Row]))[0] ?? null;
}

// Every business's list in one table (Admin -> Businesses, Admin -> Phase
// 1): live ones first, then by name. Never the demo.
const STATUS_ORDER: Record<string, number> = { live: 0, approved: 1, submitted: 2, draft: 3, suspended: 4 };

export async function listBusinessChecklists(): Promise<BusinessChecklist[]> {
  const { data, error } = await getSupabaseAdmin().from("organizations").select(ORG_COLUMNS).eq("is_demo", false).order("id", { ascending: true }).limit(500);
  throwIfSupabaseError(error, "Could not load the businesses");
  const lists = await checklistsFor((data ?? []) as Row[]);
  return lists.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
}
