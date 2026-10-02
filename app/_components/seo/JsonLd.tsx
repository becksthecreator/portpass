import { jsonLdString } from "@/lib/seo/jsonLd";

// Structured data for search engines (brief 11). Printed as a plain script
// tag in the server HTML, escaped so nothing a business typed can close it.
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
