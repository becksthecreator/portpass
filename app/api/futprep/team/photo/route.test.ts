import { beforeEach, describe, expect, it, vi } from "vitest";

// The coach photo route (brief 16, C2), with the staff session, the
// database and Supabase Storage replaced by fakes: who may call it, what it
// accepts, where the file goes, and that replacing or removing a photo can
// only ever delete a file inside that coach's own folder (the bucket is
// shared with every business's logo and gallery).
const auth = vi.hoisted(() => ({ account: null as string | null, role: null as string | null }));
const store = vi.hoisted(() => ({
  uploads: [] as Array<{ path: string; contentType: string }>,
  removed: [] as string[],
  uploadError: null as null | { message: string },
}));
const data = vi.hoisted(() => ({ previousUrl: null as string | null, fail: null as string | null, saved: [] as Array<{ coachId: number; url: string | null }> }));

vi.mock("@/app/futprep/staff-auth", () => ({
  currentFutprepStaffAccount: vi.fn(async () => auth.account),
  currentFutprepStaffRole: vi.fn(async () => auth.role),
  canManageFutprepTeam: (role: string) => role === "admin" || role === "ceo",
}));
vi.mock("@/db/coaches", () => ({
  listAllCoachProfiles: vi.fn(async () => ({ schemaReady: true, coaches: [] })),
  setCoachPhoto: vi.fn(async (coachId: number, url: string | null) => {
    if (data.fail) throw new Error(data.fail);
    data.saved.push({ coachId, url });
    return { previousUrl: data.previousUrl };
  }),
}));
vi.mock("@/db/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: vi.fn(async (...args: [string, unknown, { contentType: string }]) => {
          const [path, , options] = args;
          if (store.uploadError) return { error: store.uploadError };
          store.uploads.push({ path, contentType: options.contentType });
          return { error: null };
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/org-assets/${path}` } }),
        remove: vi.fn(async (paths: string[]) => {
          store.removed.push(...paths);
          return { error: null };
        }),
      }),
    },
  }),
}));
vi.mock("@/lib/revalidate", () => ({ bumpListings: vi.fn() }));

import { DELETE, POST } from "./route";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const OURS = "https://x.supabase.co/storage/v1/object/public/org-assets/";

function upload(coachId: unknown, bytes: Uint8Array = JPEG, name = "photo.jpg") {
  const form = new FormData();
  if (coachId !== undefined) form.append("coachId", String(coachId));
  form.append("file", new File([bytes], name, { type: "image/jpeg" }));
  return new Request("http://localhost/api/futprep/team/photo", { method: "POST", body: form });
}

function remove(body: unknown) {
  return new Request("http://localhost/api/futprep/team/photo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  auth.account = "alex";
  auth.role = "ceo";
  store.uploads.length = 0;
  store.removed.length = 0;
  store.uploadError = null;
  data.previousUrl = null;
  data.fail = null;
  data.saved.length = 0;
});

describe("who may change a coach photo", () => {
  it("refuses a signed-out caller with 401 and touches nothing", async () => {
    auth.account = null;
    auth.role = null;
    expect((await POST(upload(7))).status).toBe(401);
    expect((await DELETE(remove({ coachId: 7 }))).status).toBe(401);
    expect(store.uploads).toEqual([]);
    expect(data.saved).toEqual([]);
  });

  it("refuses a coach or a helper with 403: only an admin or the CEO manages the team", async () => {
    for (const role of ["coach", "helper"]) {
      auth.role = role;
      expect((await POST(upload(7))).status).toBe(403);
      expect((await DELETE(remove({ coachId: 7 }))).status).toBe(403);
    }
    expect(store.uploads).toEqual([]);
    expect(data.saved).toEqual([]);
    auth.role = "admin";
    expect((await POST(upload(7))).status).toBe(201);
  });
});

describe("what an upload accepts", () => {
  it("stores a real image under the coach's own folder and saves its URL", async () => {
    const response = await POST(upload(7));
    expect(response.status).toBe(201);
    expect(store.uploads).toHaveLength(1);
    expect(store.uploads[0].path).toMatch(/^coach\/7\/[0-9a-f-]{36}\.jpg$/);
    expect(store.uploads[0].contentType).toBe("image/jpeg");
    expect(data.saved).toEqual([{ coachId: 7, url: `${OURS}${store.uploads[0].path}` }]);
    expect((await response.json()).photoUrl).toBe(`${OURS}${store.uploads[0].path}`);
  });

  it("goes by the bytes, not the declared type or the file name", async () => {
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>".padEnd(64, " "));
    expect((await POST(upload(7, html, "photo.jpg"))).status).toBe(400);
    expect(store.uploads).toEqual([]);
  });

  it("refuses a file over 4 MB", async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect((await POST(upload(7, big))).status).toBe(413);
    expect(store.uploads).toEqual([]);
  });

  it("needs a real coach id: nothing that merely coerces to a number", async () => {
    for (const id of [undefined, "", "abc", "0", "-3", "7.5", "true"]) {
      expect((await POST(upload(id))).status).toBe(400);
    }
    for (const body of [null, {}, { coachId: true }, { coachId: [7] }, { coachId: "7; drop" }]) {
      expect((await DELETE(remove(body))).status).toBe(400);
    }
    expect(data.saved).toEqual([]);
  });

  it("removes the new file again when the coach no longer exists", async () => {
    data.fail = "COACH_NOT_FOUND";
    expect((await POST(upload(7))).status).toBe(404);
    expect(store.removed).toEqual([store.uploads[0].path]);
  });
});

describe("what replacing or removing a photo may delete", () => {
  it("deletes the previous file when it sits in this coach's own folder", async () => {
    data.previousUrl = `${OURS}coach/7/old.jpg`;
    await POST(upload(7));
    expect(store.removed).toEqual(["coach/7/old.jpg"]);

    store.removed.length = 0;
    expect((await DELETE(remove({ coachId: 7 }))).status).toBe(200);
    expect(store.removed).toEqual(["coach/7/old.jpg"]);
    expect(data.saved[data.saved.length - 1]).toEqual({ coachId: 7, url: null });
  });

  it("never deletes another coach's file, a business's file, or anything outside the bucket", async () => {
    for (const previous of [
      `${OURS}coach/8/someone-else.jpg`,
      `${OURS}coach/70/prefix-lookalike.jpg`,
      `${OURS}org/2/logo/their-logo.png`,
      `${OURS}coach/7/../../org/2/logo/their-logo.png`,
      "https://x.supabase.co/storage/v1/object/public/other-bucket/coach/7/a.jpg",
      "https://example.com/pasted.jpg",
      "/futprep/coaches/ronaldo-greene.jpg",
      `${OURS}coach/7/%E0%A4%A.jpg`,
    ]) {
      data.previousUrl = previous;
      expect((await POST(upload(7))).status).toBe(201);
      expect((await DELETE(remove({ coachId: 7 }))).status).toBe(200);
    }
    expect(store.removed).toEqual([]);
  });
});
