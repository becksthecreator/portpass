// PortPass's own contact details -- the platform's, not any business's.
// Bahamas Weddings By The Sea deliberately shows its own number
// (424-1262) on its own pages; nothing from here belongs there.
export const PORTPASS_SUPPORT_EMAIL = "portpassbahamas@outlook.com";
export const PORTPASS_PHONE_E164 = "+12424238161";
export const PORTPASS_PHONE_DISPLAY = "+1 (242) 423-8161";
export const PORTPASS_WHATSAPP_URL = "https://wa.me/12424238161";

export function portpassWhatsAppUrl(message?: string) {
  return message ? `${PORTPASS_WHATSAPP_URL}?text=${encodeURIComponent(message)}` : PORTPASS_WHATSAPP_URL;
}
