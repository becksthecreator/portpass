// PortPass's own contact details -- the platform's, not any business's.
// Bahamas Weddings By The Sea deliberately shows its own number
// (424-1262) on its own pages; nothing from here belongs there.
// The company address on PortPass's own domain (Bex, 23 Nov 2026), replacing
// the Outlook one. Shown on the site and invoices, used as the reply-to of
// every email PortPass sends as itself, and where founders' notifications go.
export const PORTPASS_SUPPORT_EMAIL = "info@portpassbahamas.com";
export const PORTPASS_PHONE_E164 = "+12424238161";
export const PORTPASS_PHONE_DISPLAY = "+1 (242) 423-8161";
export const PORTPASS_WHATSAPP_URL = "https://wa.me/12424238161";

export function portpassWhatsAppUrl(message?: string) {
  return message ? `${PORTPASS_WHATSAPP_URL}?text=${encodeURIComponent(message)}` : PORTPASS_WHATSAPP_URL;
}
