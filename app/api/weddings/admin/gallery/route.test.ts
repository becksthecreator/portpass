import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Wedding Desk's gallery save, with the staff session and the database
// replaced by fakes: a photo that is not one of BWS's own is a 400 with a
// plain message and nothing is written; BWS's own photos still save. The
// fake answers the BWS lookup (organizations) with BWS_ID and records every
// gallery write.
const auth = vi.hoisted(() => ({ role: "wedding_desk" as string | null }));
const db = vi.hoisted(() => ({ bwsId: 2, writes: [] as Record<string, unknown>[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/weddings/staff-auth", () => ({ currentWeddingStaffRole: vi.fn(async () => auth.role) }));
vi.mock("@/db/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      if (table === "organizations") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: db.bwsId }, error: null }) }) }) };
      }
      if (table !== "wedding_gallery_images") throw new Error(`unexpected table ${table}`);
      return {
        insert: async (record: Record<string, unknown>) => { db.writes.push(record); return { error: null }; },
        update: (record: Record<string, unknown>) => ({ eq: async () => { db.writes.push(record); return { error: null }; } }),
        select: () => ({ order: async () => ({ data: [], error: null }) }),
      };
    },
  }),
  throwIfSupabaseError: (error: unknown) => {
    if (error) throw error;
  },
}));
vi.mock("@/lib/revalidate", () => ({ bumpListings: vi.fn() }));

import { POST } from "./route";

const SUPABASE = "https://abc.supabase.co";
const OURS = `${SUPABASE}/storage/v1/object/public/org-assets/`;
const UUID = "0b6c3f4e-1d2a-4b5c-8d9e-0f1a2b3c4d5e";
const REFUSED = "Use a photo from /weddings/bahamas-by-the-sea/ or one uploaded for Bahamas Weddings By The Sea. Links to other websites can't be used.";

function save(imageUrl: unknown, id: number | null = null) {
  return new Request("http://localhost/api/weddings/admin/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, imageUrl, caption: "TEST — delete", visibility: "draft", sortOrder: 99 }),
  });
}

beforeEach(() => {
  auth.role = "wedding_desk";
  db.writes = [];
  vi.stubEnv("SUPABASE_URL", SUPABASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/weddings/admin/gallery", () => {
  it("refuses an outside link with a 400 and writes nothing", async () => {
    for (const imageUrl of [
      "https://tracker.example.com/pixel.gif",
      "https://images.squarespace-cdn.com/content/v1/abc/photo.jpg",
      "//evil.example/photo.jpg",
      "/weddings/other/photo.webp",
      "/weddings/bahamas-by-the-sea/../../photo.jpg",
      `https://other.supabase.co/storage/v1/object/public/org-assets/org/2/photo/${UUID}.jpg`,
      `${OURS}org/9/photo/${UUID}.jpg`,
      12,
    ]) {
      const response = await POST(save(imageUrl));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(REFUSED);
    }
    const update = await POST(save("https://tracker.example.com/pixel.gif", 22));
    expect(update.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it("still asks for a photo when the field is blank", async () => {
    for (const imageUrl of ["", "   ", undefined, null]) {
      const response = await POST(save(imageUrl));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Add an image URL.");
    }
    expect(db.writes).toEqual([]);
  });

  it("saves a photo shipped with the site and one uploaded for BWS", async () => {
    const site = await POST(save(" /weddings/bahamas-by-the-sea/bws-11.webp "));
    expect(site.status).toBe(200);
    const upload = await POST(save(`${OURS}org/2/photo/${UUID}.jpg`, 22));
    expect(upload.status).toBe(200);
    expect(db.writes.map((w) => w.image_url)).toEqual(["/weddings/bahamas-by-the-sea/bws-11.webp", `${OURS}org/2/photo/${UUID}.jpg`]);
  });

  it("asks a signed-out caller to sign in before looking at the photo", async () => {
    auth.role = null;
    const response = await POST(save("https://tracker.example.com/pixel.gif"));
    expect(response.status).toBe(401);
    expect(db.writes).toEqual([]);
  });
});
