import { describe, expect, it } from "vitest";
import { nassauLocalToIso } from "@/lib/futprepTerms";
import {
  buildPickListCsv,
  buildReservationsCsv,
  canReserve,
  countdownParts,
  countdownTarget,
  dropPhase,
  dropShareLinks,
  filterReservations,
  holdUntil,
  isoToNassauLocal,
  isPastHold,
  licenceLabel,
  makeReferenceCode,
  normalizeShopReference,
  paymentMethodLabel,
  pickList,
  priceOrder,
  reservationStats,
  resolveShopSource,
  whatsappHref,
  type CatalogueVariant,
  type DropWindow,
  type ListedReservation,
} from "./rules";

const NOW = new Date("2026-10-10T16:00:00Z");
const at = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * 3600_000).toISOString();

describe("the drop window", () => {
  const base: DropWindow = { status: "published", opensAt: at(1), closesAt: at(48), followersFirstUntil: null };

  it("is upcoming, then open, then closed", () => {
    expect(dropPhase(base, NOW)).toBe("upcoming");
    expect(dropPhase({ ...base, opensAt: at(-1) }, NOW)).toBe("open");
    expect(dropPhase({ ...base, opensAt: at(-49), closesAt: at(-1) }, NOW)).toBe("closed");
    expect(dropPhase({ ...base, status: "draft", opensAt: at(-1) }, NOW)).toBe("draft");
    expect(dropPhase({ ...base, status: "closed", opensAt: at(-1) }, NOW)).toBe("closed");
  });

  it("lets only the followers' link in before the public open", () => {
    const followers = { ...base, opensAt: at(-1), followersFirstUntil: at(2) };
    const phase = dropPhase(followers, NOW);
    expect(phase).toBe("followers");
    expect(canReserve(phase, true)).toBe(true);
    expect(canReserve(phase, false)).toBe(false);
    expect(countdownTarget(followers, phase, false)).toBe(at(2));
    expect(countdownTarget(followers, phase, true)).toBeNull();
    expect(dropPhase(followers, new Date(Date.parse(at(3))))).toBe("open");
  });

  it("counts down to opens_at before anything opens", () => {
    expect(countdownTarget(base, "upcoming", false)).toBe(base.opensAt);
    expect(canReserve("upcoming", true)).toBe(false);
    expect(countdownParts(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(countdownParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("reference codes", () => {
  it("are the shop prefix and six unambiguous characters", () => {
    const code = makeReferenceCode("KL", new Uint8Array([0, 1, 2, 3, 250, 255]));
    expect(code).toMatch(/^KL-[A-Z0-9]{6}$/);
    expect(code.slice(3)).not.toMatch(/[01OILS5]/);
    expect(normalizeShopReference(" kl-7kq3mx ")).toBe("KL-7KQ3MX");
    expect(normalizeShopReference("KL-7KQ3M%")).toBeNull();
    expect(normalizeShopReference(42)).toBeNull();
  });
});

const catalogue = new Map<number, CatalogueVariant>([
  [1, { variantId: 1, productId: 10, title: "Home jersey", label: "M", unitCents: 6500, stock: 1 }],
  [2, { variantId: 2, productId: 10, title: "Home jersey", label: "L", unitCents: 6500, stock: 0 }],
  [3, { variantId: 3, productId: 11, title: "Cap", label: "One size", unitCents: 2500, stock: null }],
]);

describe("pricing an order", () => {
  it("prices from the catalogue and merges repeated sizes", () => {
    const priced = priceOrder([{ variantId: 3, qty: 1 }, { variantId: 3, qty: 2 }, { variantId: 1, qty: 1 }], catalogue);
    expect(priced).toEqual({
      ok: true,
      items: [
        { variantId: 3, productId: 11, title: "Cap", label: "One size", qty: 3, unitCents: 2500 },
        { variantId: 1, productId: 10, title: "Home jersey", label: "M", qty: 1, unitCents: 6500 },
      ],
      totalCents: 14000,
    });
  });

  it("names the sold-out sizes", () => {
    const priced = priceOrder([{ variantId: 2, qty: 1 }, { variantId: 1, qty: 2 }], catalogue);
    expect(priced.ok).toBe(false);
    if (!priced.ok) {
      expect(priced.soldOut).toEqual([2, 1]);
      expect(priced.error).toContain("Home jersey (L)");
      expect(priced.error).toContain("waitlist");
    }
  });

  it("refuses empty orders, odd quantities and sizes from elsewhere", () => {
    expect(priceOrder([], catalogue).ok).toBe(false);
    expect(priceOrder([{ variantId: 3, qty: 0 }], catalogue).ok).toBe(false);
    expect(priceOrder([{ variantId: 3, qty: 11 }], catalogue).ok).toBe(false);
    expect(priceOrder([{ variantId: 3, qty: 6 }, { variantId: 3, qty: 6 }], catalogue).ok).toBe(false);
    expect(priceOrder([{ variantId: 99, qty: 1 }], catalogue).ok).toBe(false);
    expect(priceOrder([{ variantId: 1.5, qty: 1 }], catalogue).ok).toBe(false);
  });
});

describe("where an order came from (Handbook §5)", () => {
  const empty = { utmSource: null, utmMedium: null, utmCampaign: null, referrerHost: null, viaPortpass: false };

  it("counts only a PortPass link or a PortPass page as brought by PortPass", () => {
    expect(resolveShopSource({ ...empty, utmSource: "portpass", utmMedium: "link" })).toEqual({ source: "portpass", commissionEligible: true, reason: "PortPass link" });
    expect(resolveShopSource({ ...empty, viaPortpass: true })).toMatchObject({ source: "portpass", commissionEligible: true });
  });

  it("keeps the seller's Instagram link and everything else out of commission", () => {
    expect(resolveShopSource({ ...empty, utmSource: "instagram", utmMedium: "seller_bio" })).toMatchObject({ source: "instagram", commissionEligible: false });
    expect(resolveShopSource({ ...empty, referrerHost: "l.instagram.com" })).toMatchObject({ source: "instagram", commissionEligible: false });
    expect(resolveShopSource({ ...empty, utmSource: "whatsapp" })).toMatchObject({ source: "direct", commissionEligible: false, reason: "Other link (whatsapp)" });
    expect(resolveShopSource(null)).toMatchObject({ source: "direct", commissionEligible: false, reason: "Direct" });
  });

  it("builds the seller's share links", () => {
    const links = dropShareLinks("https://portpassbahamas.com", "kit-labs", "independence", "abc123");
    expect(links.portpass).toBe("https://portpassbahamas.com/shop/kit-labs/drop/independence?utm_source=portpass&utm_medium=link&utm_campaign=drop_independence");
    expect(links.instagram).toContain("utm_source=instagram");
    expect(links.followers).toContain("?k=abc123&");
  });
});

function reservation(overrides: Partial<ListedReservation>): ListedReservation {
  return {
    id: 1,
    referenceCode: "KL-AAAAAA",
    buyerName: "TEST Buyer",
    buyerPhone: "+12425550100",
    buyerEmail: null,
    items: [{ variantId: 1, productId: 10, title: "Home jersey", label: "M", qty: 1, unitCents: 6500 }],
    totalCents: 6500,
    paymentMethod: "bank_transfer",
    paymentStatus: "pending",
    status: "active",
    fulfilment: "pickup",
    zone: null,
    deliveryNote: null,
    holdUntil: at(48),
    paidAt: null,
    collectedAt: null,
    cancelledAt: null,
    source: "direct",
    commissionEligible: false,
    createdAt: at(0),
    ...overrides,
  };
}

describe("holds", () => {
  it("ends the hold after the shop's hours", () => {
    expect(holdUntil(NOW, 48).toISOString()).toBe(at(48));
  });

  it("offers only unpaid, uncollected, active reservations past the hold for release", () => {
    expect(isPastHold(reservation({ holdUntil: at(-1) }), NOW)).toBe(true);
    expect(isPastHold(reservation({ holdUntil: at(1) }), NOW)).toBe(false);
    expect(isPastHold(reservation({ holdUntil: at(-1), paymentStatus: "paid" }), NOW)).toBe(false);
    expect(isPastHold(reservation({ holdUntil: at(-1), collectedAt: at(-2) }), NOW)).toBe(false);
    expect(isPastHold(reservation({ holdUntil: at(-1), status: "released" }), NOW)).toBe(false);
  });
});

describe("the seller's numbers", () => {
  const list = [
    reservation({ id: 1, source: "portpass", commissionEligible: true, paymentStatus: "paid", totalCents: 13000, items: [{ variantId: 1, productId: 10, title: "Home jersey", label: "M", qty: 2, unitCents: 6500 }] }),
    reservation({ id: 2, source: "portpass", commissionEligible: true, paymentStatus: "pending" }),
    reservation({ id: 3, source: "instagram", paymentStatus: "paid", collectedAt: at(1) }),
    reservation({ id: 4, source: "direct", status: "released" }),
    reservation({ id: 5, source: "direct", items: [{ variantId: 3, productId: 11, title: "Cap", label: "One size", qty: 1, unitCents: 2500 }], totalCents: 2500 }),
  ];

  it("counts reserved, paid, collected and revenue, and commission only on PortPass-brought paid orders", () => {
    const stats = reservationStats(list);
    expect(stats.reserved).toBe(4);
    expect(stats.paid).toBe(2);
    expect(stats.collected).toBe(1);
    expect(stats.revenuePaidCents).toBe(19500);
    expect(stats.bySource.portpass).toEqual({ orders: 2, paid: 1, paidCents: 13000 });
    expect(stats.bySource.instagram).toEqual({ orders: 1, paid: 1, paidCents: 6500 });
    expect(stats.bySource.direct).toEqual({ orders: 1, paid: 0, paidCents: 0 });
    expect(stats.commissionableOrders).toBe(1);
    expect(stats.commissionableCents).toBe(13000);
  });

  it("filters by size, paid and collected", () => {
    const base = { variant: null, paid: "all", collected: "all", showCancelled: false } as const;
    expect(filterReservations(list, base).map((r) => r.id)).toEqual([1, 2, 3, 5]);
    expect(filterReservations(list, { ...base, showCancelled: true }).map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(filterReservations(list, { ...base, paid: "paid" }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterReservations(list, { ...base, paid: "unpaid" }).map((r) => r.id)).toEqual([2, 5]);
    expect(filterReservations(list, { ...base, collected: "collected" }).map((r) => r.id)).toEqual([3]);
    expect(filterReservations(list, { ...base, variant: "11:One size" }).map((r) => r.id)).toEqual([5]);
  });

  it("makes a pick list of sizes x counts from what still holds stock", () => {
    expect(pickList(list)).toEqual([
      { product: "Cap", size: "One size", reserved: 1, paid: 0, collected: 0, toCollect: 1 },
      { product: "Home jersey", size: "M", reserved: 4, paid: 3, collected: 1, toCollect: 3 },
    ]);
    const csv = buildPickListCsv(list);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Product","Size","Reserved","Paid","Collected","Still to collect"');
    expect(csv).toContain('"Home jersey","M","4","3","1","3"');
  });

  it("exports reservations with spreadsheet formulas neutralised", () => {
    const csv = buildReservationsCsv([reservation({ buyerName: "=HYPERLINK(1)" })]);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain('"Home jersey M x1"');
    expect(csv).toContain('"65.00"');
  });
});

describe("labels and links", () => {
  it("says fan edition or official licensed, and how to pay", () => {
    expect(licenceLabel("fan_edition")).toBe("Fan edition");
    expect(licenceLabel("official_licensed")).toBe("Official licensed");
    expect(licenceLabel(null)).toBeNull();
    expect(paymentMethodLabel("cash", "pickup")).toBe("Cash at pickup");
    expect(paymentMethodLabel("cash", "seller_delivery")).toBe("Cash on delivery");
    expect(paymentMethodLabel("bank_transfer")).toBe("Bank transfer");
  });

  it("prefills WhatsApp with digits only", () => {
    expect(whatsappHref("+12425550100", "Hi, KL-7KQ3MX")).toBe("https://wa.me/12425550100?text=Hi%2C%20KL-7KQ3MX");
  });

  it("round-trips a Nassau wall-clock time in summer and winter", () => {
    for (const local of ["2026-10-10T18:00", "2026-12-05T09:30"]) {
      expect(isoToNassauLocal(nassauLocalToIso(local))).toBe(local);
    }
    expect(isoToNassauLocal(null)).toBe("");
  });
});
