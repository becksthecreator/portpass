import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Wedding Desk's package save, with the staff session and the database
// replaced by fakes: a photo that is not one of BWS's own is a 400 with a
// plain message, and nothing is read or written.
const auth = vi.hoisted(() => ({ role: "wedding_desk" as string | null }));
const db = vi.hoisted(() => ({ calls: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/app/weddings/staff-auth", () => ({ currentWeddingStaffRole: vi.fn(async () => auth.role) }));
vi.mock("@/db/supabase", () => ({
  getSupabaseAdmin: () => {
    db.calls += 1;
    throw new Error("the database is not reached in this test");
  },
  throwIfSupabaseError: () => undefined,
}));
vi.mock("@/lib/revalidate", () => ({ bumpListings: vi.fn() }));

import { POST } from "./route";

function save(imageUrl: unknown) {
  return new Request("http://localhost/api/weddings/admin/packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "pink-sand", name: "Pink Sand", priceDollars: 550, visibility: "live", imageUrl }),
  });
}

beforeEach(() => {
  auth.role = "wedding_desk";
  db.calls = 0;
  vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/weddings/admin/packages", () => {
  it("refuses an outside photo with a 400 and touches nothing", async () => {
    for (const imageUrl of [
      "https://tracker.example.com/pixel.gif",
      "/weddings/other/photo.webp",
      "https://other.supabase.co/storage/v1/object/public/org-assets/org/2/photo/a.jpg",
      12,
    ]) {
      const response = await POST(save(imageUrl));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Use a photo from /weddings/bahamas-by-the-sea/ or one uploaded for Bahamas Weddings By The Sea, or leave the image blank.");
    }
    expect(db.calls).toBe(0);
  });

  it("asks a signed-out caller to sign in before looking at the photo", async () => {
    auth.role = null;
    const response = await POST(save("https://tracker.example.com/pixel.gif"));
    expect(response.status).toBe(401);
    expect(db.calls).toBe(0);
  });
});
