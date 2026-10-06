import { beforeEach, describe, expect, it, vi } from "vitest";

// The page-event route (brief 05, part 2) with the database replaced by a
// fake: what it records, and everything it refuses to record. It always
// answers 204, so the assertions are on what reached the database.
const saved = vi.hoisted(() => ({ events: [] as Array<{ organizationId: number; path: string; event: string; sourceChannel: string }>, organization: { id: 7, name: "TEST Futprep" } as { id: number; name: string } | null, overCap: false }));

vi.mock("@/app/futprep/staff-auth", () => ({ FUTPREP_STAFF_COOKIE: "portpass_futprep_staff" }));
vi.mock("@/db/growth", () => ({
  futprepOrganization: vi.fn(async () => saved.organization),
  pageEventsOverCap: vi.fn(async () => saved.overCap),
  recordPageEvent: vi.fn(async (event: { organizationId: number; path: string; event: string; sourceChannel: string }) => {
    saved.events.push(event);
  }),
}));

import { POST } from "./route";

let ip = 0;
function send(body: unknown, headers: Record<string, string> = {}) {
  ip += 1;
  return POST(new Request("http://localhost/api/events", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `203.0.113.${ip}`, "user-agent": "Mozilla/5.0 (iPhone)", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) }));
}
const attribution = (value: Record<string, unknown>) => `pp_attr=${encodeURIComponent(JSON.stringify(value))}`;

beforeEach(() => {
  saved.events = [];
  saved.organization = { id: 7, name: "TEST Futprep" };
  saved.overCap = false;
});

describe("POST /api/events", () => {
  it("records a view of a public page with how the visitor arrived, and nothing else", async () => {
    const response = await send({ path: "/sports-fitness/futprep-athletics?utm_source=portpass", event: "view" }, { cookie: attribution({ s: "portpass", m: "qr" }) });
    expect(response.status).toBe(204);
    expect(saved.events).toEqual([{ organizationId: 7, path: "/sports-fitness/futprep-athletics", event: "view", sourceChannel: "qr" }]);
  });

  it("refuses a beacon carrying anything but the path and the event, and records nothing (Brief 21, part E)", async () => {
    const response = await send({ path: "/sports-fitness/futprep-athletics", event: "view", name: "TEST Parent", email: "test@test.portpass.local" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request.", unknownFields: ["email", "name"] });
    expect(saved.events).toEqual([]);
  });

  it("records a tap with no cookie as an unknown source", async () => {
    await send({ path: "/futprep/coaches", event: "whatsapp_click" });
    expect(saved.events).toEqual([{ organizationId: 7, path: "/futprep/coaches", event: "whatsapp_click", sourceChannel: "unknown" }]);
  });

  it("never records a status page, a staff page, another business's page or an event it does not know", async () => {
    await send({ path: "/futprep/my/FP-ABCD-1234", event: "view" });
    await send({ path: "/futprep/staff/coach", event: "view" });
    await send({ path: "/weddings", event: "view" });
    await send({ path: "/futprep/coaches", event: "purchase" });
    await send(null);
    expect(saved.events).toEqual([]);
  });

  it("records a return link without its token", async () => {
    await send({ path: "/futprep/register/return/abcDEF123456tokenvalue", event: "view" });
    expect(saved.events.map((e) => e.path)).toEqual(["/futprep/register/return"]);
  });

  it("ignores bots and signed-in staff, and answers 204 either way", async () => {
    expect((await send({ path: "/futprep/coaches", event: "view" }, { "user-agent": "Googlebot/2.1" })).status).toBe(204);
    expect((await send({ path: "/futprep/coaches", event: "view" }, { cookie: "portpass_futprep_staff=abc.def" })).status).toBe(204);
    expect(saved.events).toEqual([]);
  });

  it("counts only what our own pages send, never a request another website caused", async () => {
    await send({ path: "/futprep/coaches", event: "view" }, { "sec-fetch-site": "cross-site" });
    await send({ path: "/futprep/coaches", event: "view" }, { "sec-fetch-site": "", origin: "https://evil.example" });
    await send({ path: "/futprep/coaches", event: "view" }, { "sec-fetch-site": "" });
    expect(saved.events).toEqual([]);
    // An older browser that sends Origin but not Sec-Fetch-Site (the test
    // request is to http://localhost).
    await send({ path: "/futprep/coaches", event: "view" }, { "sec-fetch-site": "", origin: "http://localhost" });
    expect(saved.events).toHaveLength(1);
  });

  it("stops counting once the day's ceiling is reached", async () => {
    saved.overCap = true;
    await send({ path: "/futprep/coaches", event: "view" });
    expect(saved.events).toEqual([]);
  });

  it("slows a flood from one address", async () => {
    const flood = { "x-forwarded-for": "198.51.100.9" };
    for (let i = 0; i < 130; i += 1) await send({ path: "/futprep/coaches", event: "view" }, flood);
    expect(saved.events).toHaveLength(120);
  });

  it("does not fail the page when the database is down", async () => {
    saved.organization = null;
    expect((await send({ path: "/futprep/coaches", event: "view" })).status).toBe(204);
    expect(saved.events).toEqual([]);
  });
});
