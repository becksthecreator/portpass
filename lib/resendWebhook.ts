import { createHmac, timingSafeEqual } from "node:crypto";

// The email service (Resend) tells PortPass what happened to each email by
// calling a webhook: delivered, bounced, or marked as spam. Its calls are
// signed (the Svix scheme): an id, a timestamp and a signature over
// "id.timestamp.body" made with a secret only the two sides hold. A call
// that is not signed, or is more than five minutes old, is refused.

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function verifyResendSignature(input: { secret: string | undefined; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number }): boolean {
  const { secret, id, timestamp, signature, body } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  // "v1,<signature> v1,<signature>": any one may match, so the secret can
  // be changed without a gap.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    if (comma < 0 || part.slice(0, comma) !== "v1") continue;
    const given = Buffer.from(part.slice(comma + 1), "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export type DeliveryStatus = "delivered" | "bounced" | "complained";

const STATUS_FOR_EVENT: Record<string, DeliveryStatus> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

// What the event means for the Messages log: the email's id and its new
// status, with a few words on why it bounced. Anything else (opened,
// clicked, delayed) is ignored.
export function deliveryFromEvent(event: unknown): { providerId: string; status: DeliveryStatus; detail: string | null } | null {
  if (!event || typeof event !== "object") return null;
  const { type, data } = event as { type?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown; subType?: unknown } } };
  const status = typeof type === "string" ? STATUS_FOR_EVENT[type] : undefined;
  const providerId = typeof data?.email_id === "string" ? data.email_id : "";
  if (!status || !/^[A-Za-z0-9-]{8,100}$/.test(providerId)) return null;
  // Only the service's own short labels ("Permanent", "Suppressed"): never
  // free text from the message.
  const words = [data?.bounce?.type, data?.bounce?.subType].filter((w): w is string => typeof w === "string" && /^[A-Za-z ]{1,40}$/.test(w));
  const detail = status === "bounced" ? (words.length ? `Bounced: ${words.join(", ")}.` : "Bounced: the address did not accept it.") : status === "complained" ? "Marked as spam by the person who received it." : null;
  return { providerId, status, detail };
}
