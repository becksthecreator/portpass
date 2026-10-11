import { describe, expect, it } from "vitest";
import { buyerOrderEmail, sellerOrderEmail, type OrderEmailInput } from "./orderEmail";

const input: OrderEmailInput = {
  sellerName: "TEST Kit <Shop>",
  buyerName: "Tessa Buyer",
  referenceCode: "TK-ABC234",
  items: [{ variantId: 1, productId: 7, title: "TEST Home jersey", label: "S", qty: 2, unitCents: 3500 }],
  subtotalCents: 7000,
  deliveryFeeCents: 1500,
  totalCents: 8500,
  fulfilment: "seller_delivery",
  zone: "Cable Beach",
  pickupNote: "",
  paymentMethod: "bank_transfer",
  holdUntil: "2026-10-13T16:00:00.000Z",
  orderUrl: "https://portpassbahamas.com/order/TK-ABC234",
  payUrl: "https://portpassbahamas.com/pay/abc",
  payReference: "TK-0001",
  sellerWhatsappUrl: "https://wa.me/12425550160?text=Hi",
};

describe("the buyer's order email", () => {
  it("gives the code, the lines with delivery, how to pay the seller and where to follow it", () => {
    const { subject, html } = buyerOrderEmail(input);
    expect(subject).toBe("Your order TK-ABC234 from TEST Kit <Shop>");
    expect(html).toContain("TK-ABC234");
    expect(html).toContain("2 × TEST Home jersey (S)");
    expect(html).toContain("Delivery to Cable Beach");
    expect(html).toContain("$85");
    expect(html).toContain("quoting <strong>TK-0001</strong>");
    expect(html).toContain("https://portpassbahamas.com/pay/abc");
    expect(html).toContain("https://portpassbahamas.com/order/TK-ABC234");
    expect(html).toContain("PortPass never holds your money");
  });

  it("escapes what a seller typed and never claims PortPass took a payment", () => {
    const { html } = buyerOrderEmail(input);
    expect(html).toContain("TEST Kit &lt;Shop&gt;");
    expect(html).not.toContain("<Shop>");
    expect(html.toLowerCase()).not.toMatch(/pay now|secure checkout|card|wallet|processed by portpass/);
  });

  it("says cash at collection for a cash order, with no payment page", () => {
    const { html } = buyerOrderEmail({ ...input, paymentMethod: "cash", fulfilment: "pickup", zone: null, deliveryFeeCents: 0, totalCents: 7000, pickupNote: "TEST studio, Saturdays", payUrl: null });
    expect(html).toContain("cash to TEST Kit &lt;Shop&gt; when you collect");
    expect(html).toContain("TEST studio, Saturdays");
    expect(html).not.toContain("See how to pay");
  });
});

describe("the seller's new-order email", () => {
  it("names the buyer, never their phone or email, and links to the orders page", () => {
    const { subject, html } = sellerOrderEmail({ sellerName: "TEST Kit Shop", buyerName: "Tessa Buyer", referenceCode: "TK-ABC234", items: input.items, deliveryFeeCents: 0, totalCents: 7000, zone: null, fulfilment: "pickup", paymentMethod: "bank_transfer", broughtByPortpass: true, ordersUrl: "https://portpassbahamas.com/business/test-kit/shop/orders" });
    expect(subject).toBe("New order TK-ABC234: $70.00");
    expect(html).toContain("Tessa Buyer");
    expect(html).not.toContain("555");
    expect(html).toContain("PortPass brought this order");
    expect(html).toContain("/business/test-kit/shop/orders");
  });
});
