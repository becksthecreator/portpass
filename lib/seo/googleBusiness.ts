// A business's Google Business Profile link (brief 11, 7). Only a Google
// address is kept: g.page, maps.app.goo.gl or google.com (the database
// holds the same rule).
export function isGoogleBusinessUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || value.length > 300) return false;
  const host = url.hostname.toLowerCase();
  return ["google.com", "g.page", "goo.gl"].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// The message a business sends one customer, itself, after a booking or a
// term: never sent in bulk, never by PortPass.
export function reviewRequestMessage(businessName: string, url: string): string {
  return `Thank you for choosing ${businessName}! If you have a minute, a short Google review helps other families and visitors find us: ${url}`;
}

// The link as it is stored: the host in lower case, as the database rule
// expects. Null when it isn't a Google address.
export function cleanGoogleBusinessUrl(value: string): string | null {
  if (!isGoogleBusinessUrl(value)) return null;
  return new URL(value).toString();
}
