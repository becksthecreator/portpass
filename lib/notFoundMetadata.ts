import type { Metadata } from "next";

// The 404's own title, description and share text, and noindex (pre-ads
// audit, 24 Nov). app/not-found.tsx uses it, and so does any route whose
// generateMetadata finds nothing before calling notFound(): an empty object
// there would fall back to the home page's title and description.
const TITLE = "Page not found | PortPass Bahamas";
const DESCRIPTION = "That page doesn't exist. PortPass is bookings for businesses across The Bahamas: classes, tours, tables, appointments and events, paid to the business directly.";

export const NOT_FOUND_METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};
