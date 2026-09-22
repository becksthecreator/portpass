import { ImageResponse } from "next/og";
import { getOrganizationListingBySlug } from "@/db/organizations";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Own favicon per business, not the coral P -- carries over the bespoke
// palm-tree mark for bahamas-weddings exactly, and falls back to a
// brand-tinted initial for any business that hasn't supplied a logo yet.
export default async function Icon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === "bahamas-weddings") {
    return new ImageResponse(
      (
        <div style={{ fontSize: 22, background: "#fbfaf5", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          🌴
        </div>
      ),
      size
    );
  }

  const listing = await getOrganizationListingBySlug(slug);
  const org = listing?.organization;
  const initial = (org?.name ?? "P").trim().charAt(0).toUpperCase();
  const brand = org?.brandColor ?? "#e8794a";

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#fff",
          background: brand,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
        }}
      >
        {initial}
      </div>
    ),
    size
  );
}
