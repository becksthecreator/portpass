import { escapeHtml } from "@/lib/email";
import { firstName, money } from "@/lib/paymentRequests/rules";
import { formatNassau, type Fulfilment, type ReservationItem, type ShopPaymentMethod } from "@/lib/shop/rules";

// The two emails a Market order sends (brief 25, C2), both because the
// buyer pressed "Place order": the buyer's (their code, what they ordered,
// how to pay the seller, where to follow it) and the seller's (a new order
// to look at). From "<Seller> via PortPass". Nothing says PortPass took or
// processed any money, because it never does.

export type OrderEmailInput = {
  sellerName: string;
  buyerName: string;
  referenceCode: string;
  items: ReservationItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  fulfilment: Fulfilment;
  zone: string | null;
  pickupNote: string;
  paymentMethod: ShopPaymentMethod;
  holdUntil: string;
  orderUrl: string;
  payUrl: string | null;
  // The payment request's own reference, quoted on a bank transfer.
  payReference: string | null;
  sellerWhatsappUrl: string | null;
};

function itemsTable(input: Pick<OrderEmailInput, "items" | "deliveryFeeCents" | "zone" | "totalCents">): string {
  const rows = input.items
    .map((item) => `<tr><td style="padding:6px 0">${escapeHtml(`${item.qty > 1 ? `${item.qty} × ` : ""}${item.title} (${item.label})`)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${money(item.qty * item.unitCents)}</td></tr>`)
    .join("");
  const delivery = input.deliveryFeeCents > 0 ? `<tr><td style="padding:6px 0">${escapeHtml(`Delivery${input.zone ? ` to ${input.zone}` : ""}`)}</td><td style="padding:6px 0;text-align:right">${money(input.deliveryFeeCents)}</td></tr>` : "";
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px">
      ${rows}${delivery}
      <tr><td style="padding:8px 0;border-top:1px solid #d9dee8"><strong>Total</strong></td><td style="padding:8px 0;border-top:1px solid #d9dee8;text-align:right"><strong>${money(input.totalCents)}</strong></td></tr>
    </table>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0D1B3D;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${escapeHtml(label)}</a></p>`;

// A business name as it may sit in a subject line: one line.
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function shell(sellerName: string, title: string, body: string): string {
  const seller = escapeHtml(sellerName);
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <p style="font-size:13px;font-weight:700;margin:0 0 6px;color:#4b5563">${seller}</p>
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${body}
    <p style="color:#647069;font-size:12px;margin-top:32px">Sent by ${seller} through PortPass Market · portpassbahamas.com</p>
  </div>`;
}

export function buyerOrderEmail(input: OrderEmailInput): { subject: string; html: string } {
  const seller = escapeHtml(input.sellerName);
  const code = escapeHtml(input.referenceCode);
  const held = escapeHtml(formatNassau(input.holdUntil));
  const getting =
    input.fulfilment === "pickup"
      ? `<p><strong>Pickup:</strong> ${escapeHtml(input.pickupNote || `${input.sellerName} will tell you where and when.`)}</p>`
      : `<p><strong>Delivery${input.zone ? ` to ${escapeHtml(input.zone)}` : ""}:</strong> ${seller} will arrange a time with you.</p>`;
  const pay =
    input.paymentMethod === "cash"
      ? `<p><strong>How to pay:</strong> cash to ${seller} when you collect.</p>`
      : `<p><strong>How to pay:</strong> by bank transfer to ${seller}${input.payReference ? `, quoting <strong>${escapeHtml(input.payReference)}</strong>` : ""}. The bank details are on your payment page.</p>
      ${input.payUrl ? button(input.payUrl, "See how to pay") : ""}`;
  const contact = input.sellerWhatsappUrl ? `<p>Questions? <a href="${escapeHtml(input.sellerWhatsappUrl)}">Message ${seller} on WhatsApp</a> and give your order code.</p>` : `<p>Questions? Contact ${seller} and give your order code.</p>`;
  const subject = `Your order ${input.referenceCode} from ${oneLine(input.sellerName)}`;
  const body = `<p>Hi ${escapeHtml(firstName(input.buyerName))},</p>
    <p>${seller} has your order. Your order code is <strong>${code}</strong>.</p>
    ${itemsTable(input)}
    ${getting}
    ${pay}
    <p>${seller} holds your order until ${held}. If it isn't paid by then, they may release it.</p>
    ${button(input.orderUrl, "Follow your order")}
    ${contact}
    <p style="font-size:13px;color:#4b5563">You pay ${seller} directly. PortPass never holds your money.</p>`;
  return { subject, html: shell(input.sellerName, `Order ${input.referenceCode}`, body) };
}

export type SellerOrderEmailInput = {
  sellerName: string;
  buyerName: string;
  referenceCode: string;
  items: ReservationItem[];
  deliveryFeeCents: number;
  totalCents: number;
  zone: string | null;
  fulfilment: Fulfilment;
  paymentMethod: ShopPaymentMethod;
  broughtByPortpass: boolean;
  ordersUrl: string;
};

// To the seller's owners. The buyer's name only: their phone and email are
// on the orders page, behind the seller's sign-in.
export function sellerOrderEmail(input: SellerOrderEmailInput): { subject: string; html: string } {
  const subject = `New order ${input.referenceCode}: ${money(input.totalCents)}`;
  const how = input.fulfilment === "pickup" ? "Pickup" : `Delivery${input.zone ? ` to ${input.zone}` : ""}`;
  const pay = input.paymentMethod === "cash" ? "cash on pickup" : "bank transfer";
  const body = `<p>${escapeHtml(input.buyerName)} ordered from your shop on PortPass Market.</p>
    ${itemsTable(input)}
    <p><strong>${escapeHtml(how)}</strong>, paying you by ${pay}.${input.broughtByPortpass ? " PortPass brought this order." : ""}</p>
    <p>The buyer has been sent the order code and how to pay you. Mark it paid when the money reaches you.</p>
    ${button(input.ordersUrl, "Open your orders")}`;
  return { subject, html: shell(input.sellerName, `New order ${input.referenceCode}`, body) };
}
