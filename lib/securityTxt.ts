import { PORTPASS_SUPPORT_EMAIL } from "./contact";

// /.well-known/security.txt (RFC 9116; Brief 21, part I): how a security
// researcher tells PortPass about a problem, and where the written policy
// is. Expires is always under a year away, as the RFC asks, so it is made
// at request time rather than written once.

export const SECURITY_TXT_HOST = "https://portpassbahamas.com";
export const SECURITY_POLICY_URL = "https://github.com/becksthecreator/portpass/blob/main/docs/security/README.md";
export const SECURITY_TXT_VALID_DAYS = 180;

export function securityTxt(now: Date = new Date()): string {
  const expires = new Date(now.getTime() + SECURITY_TXT_VALID_DAYS * 24 * 3600_000);
  return [
    `Contact: mailto:${PORTPASS_SUPPORT_EMAIL}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${SECURITY_TXT_HOST}/.well-known/security.txt`,
    `Policy: ${SECURITY_POLICY_URL}`,
    "",
  ].join("\n");
}
