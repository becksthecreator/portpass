import { describe, expect, it } from "vitest";
import { annualCents } from "@/lib/pricingFormat";
import { getPlan, listAddons, listPlans, updatePlan } from "./pricing";

// The price list of record is data (billing brief, part 1). These read the
// seed straight from the database and check the public/proposed rules.
describe("pricing tables", () => {
  it("seeds the four public plans in order, and keeps Wedding Desk private", async () => {
    const all = await listPlans({ fresh: true });
    expect(all.map((p) => p.code)).toEqual(["solo", "growing", "business", "marketplace", "wedding_desk"]);
    const pub = (await listPlans({ fresh: true, publicOnly: true })).map((p) => p.code);
    expect(pub).toEqual(["solo", "growing", "business", "marketplace"]);
    const growing = (await getPlan("growing", { fresh: true }))!;
    expect(growing.monthlyCents).toBe(12000);
    expect(growing.badge).toBe("Most popular");
    expect(annualCents(growing)).toBe(120000);
    const marketplace = (await getPlan("marketplace", { fresh: true }))!;
    expect(marketplace.kind).toBe("commission");
    expect(marketplace.commissionBps).toBe(800);
  });

  it("hides Promote while it is proposed", async () => {
    const pub = await listAddons({ fresh: true, publicOnly: true });
    expect(pub.map((a) => a.code)).toEqual(["setup", "retainer", "extra_location"]);
    const all = await listAddons({ fresh: true });
    expect(all.filter((a) => a.group === "promote").every((a) => a.status === "proposed" && !a.isPublic)).toBe(true);
  });

  it("saves a price change and reverts it", async () => {
    const before = (await getPlan("growing", { fresh: true }))!;
    const changed = await updatePlan("growing", { monthlyCents: 12100 });
    expect(changed.monthlyCents).toBe(12100);
    const reverted = await updatePlan("growing", { monthlyCents: before.monthlyCents });
    expect(reverted.monthlyCents).toBe(12000);
  });
});
