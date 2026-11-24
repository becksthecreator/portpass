import type { Metadata } from "next";

// The 404's own title, description and share text, and noindex (pre-ads
// audit, 24 Nov). app/not-found.tsx uses it, and so does any route whose
// generateMetadata finds nothing before calling notFound(): an empty object
// there would fall back to the home page's title and description.
const TITLE = "Page not found | PortPass Bahamas";
const DESCRIPTION = "That page doesn't exist on PortPass. Search for what you need, or tell us about your business.";

export const NOT_FOUND_METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false },
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};
