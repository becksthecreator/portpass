import { registrationMethods, type RegistrationPaymentMethod } from "@/lib/registrations/business";
import { methodsSetUp } from "@/lib/paymentRequests/rules";
import { getPaymentSettings } from "./paymentRequests";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The business a generic registration is for (brief 18, D1): only one
// whose page is public. A draft, an unpublished or a suspended business
// takes no registrations, whatever link is used.
export type RegistrationBusiness = {
  id: number;
  slug: string;
  name: string;
  primaryCategory: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  theme: Record<string, unknown>;
  // What the form may offer and show: the methods chosen in Get paid, the
  // bank's name, the account name and the last four digits. Never the
  // business's own transfer instructions (they may hold a full account
  // number, and belong only on a payment request's own page).
  methods: RegistrationPaymentMethod[];
  bank: { bankName: string; accountName: string; last4: string | null } | null;
};

export async function getRegistrationBusiness(slug: string): Promise<RegistrationBusiness | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id,slug,name,primary_category,brand_color,logo_url,theme,status,is_published")
    .eq("slug", slug)
    .eq("is_published", true)
    .in("status", ["live", "approved"])
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the business");
  if (!data) return null;
  const settings = await getPaymentSettings(Number(data.id)).catch(() => null);
  const methods = registrationMethods(methodsSetUp(settings));
  return {
    id: Number(data.id),
    slug: String(data.slug),
    name: String(data.name),
    primaryCategory: (data.primary_category as string | null) ?? null,
    brandColor: (data.brand_color as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
    theme: data.theme && typeof data.theme === "object" ? (data.theme as Record<string, unknown>) : {},
    methods,
    bank: settings && methods.includes("bank_transfer") ? { bankName: settings.bankName, accountName: settings.accountName, last4: settings.accountNumberLast4 } : null,
  };
}

// Who a programme is for, by its slug, within one business. The API reads
// it before validating, because it decides which fields are required.
export async function getProgramAudience(organizationId: number, programSlug: string): Promise<"children" | "adults" | "mixed" | null> {
  const { data, error } = await getSupabaseAdmin().from("programs").select("audience").eq("organization_id", organizationId).eq("slug", programSlug).eq("active", true).maybeSingle();
  throwIfSupabaseError(error, "Could not load the programme");
  if (!data) return null;
  return data.audience === "adults" || data.audience === "mixed" ? data.audience : "children";
}
