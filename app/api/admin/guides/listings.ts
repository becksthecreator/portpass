import type { GuideListing } from "@/db/guides";

// The businesses a guide links to, as the editor sends them: at most 30,
// each once, each with an optional line on why.
export function cleanListings(value: unknown): GuideListing[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: GuideListing[] = [];
  for (const item of value.slice(0, 30)) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = Number(raw.organizationId);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const note = typeof raw.note === "string" ? raw.note.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    out.push({ organizationId: id, note: note || null, sortOrder: out.length });
  }
  return out;
}
