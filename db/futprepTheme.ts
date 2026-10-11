import "server-only";
import { FLAMINGO_NIGHT, themeTokens, tokenStyle, type FutprepTokens } from "@/lib/futprepTheme";
import { getSupabaseAdmin } from "./supabase";

// Futprep's palette from its own row (brief 27, D): organizations.theme
// .tokens for slug "futprep", read once every five minutes per server.
// Any hiccup returns Flamingo Night as shipped, so a page is never
// without its colours. One cache slot, for one business: this is
// Futprep-only by design. Another business's tokens would need a cache
// keyed by slug, not this function.
let cached: { at: number; tokens: FutprepTokens } | null = null;

export async function futprepTokens(): Promise<FutprepTokens> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.tokens;
  try {
    const { data, error } = await getSupabaseAdmin().from("organizations").select("theme").eq("slug", "futprep").maybeSingle();
    if (error) throw error;
    cached = { at: Date.now(), tokens: themeTokens(data?.theme) };
  } catch (error) {
    console.error("futprep theme: using the shipped palette", error instanceof Error ? error.message : "");
    cached = { at: Date.now(), tokens: { ...FLAMINGO_NIGHT } };
  }
  return cached.tokens;
}

// The style attribute for a Futprep page's root.
export async function futprepTokenStyle(): Promise<Record<string, string>> {
  return tokenStyle(await futprepTokens());
}
