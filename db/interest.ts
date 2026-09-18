import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type InterestCategory = "venues" | "events" | "entertainment";

export type InterestSubmissionInput = {
  category: InterestCategory;
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
  utm?: Record<string, string>;
};

export async function createInterestSubmission(input: InterestSubmissionInput) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("interest_submissions")
    .insert({
      category: input.category,
      name: input.name || null,
      email: input.email || null,
      phone: input.phone || null,
      note: input.note || null,
      utm: input.utm ?? {},
    })
    .select("id")
    .single();
  throwIfSupabaseError(error, "Could not save interest submission");
  if (!data) throw new Error("Could not save interest submission");
  return { id: data.id as number };
}
