import { BRAND, OG_FONT_FAMILY, PMark } from "./PMark";

// Shared Open Graph card for organization pages: hero photo (when there is
// one Satori can decode), business name, the PortPass mark. Rendered
// through next/og's ImageResponse, which has two constraints worth knowing
// before editing: every element with more than one child needs
// display:flex, and images must be PNG or JPEG -- no WebP, which is why
// the BWS card reads hero.jpg rather than the page's own bws-10.webp. The
// frame is PortPass's Harbour Signal brand (navy, white title, the domain
// in sky); the business's own colours are not used here, the photo is
// what carries its identity.
export type OgPhoto = { data: ArrayBuffer | Buffer; mime: "image/jpeg" | "image/png" };

export function OrgOgCard({ name, tagline, photo }: { name: string; tagline?: string | null; photo?: OgPhoto | null }) {
  const bytes = photo ? (Buffer.isBuffer(photo.data) ? photo.data : Buffer.from(photo.data)) : null;
  const src = photo && bytes ? `data:${photo.mime};base64,${bytes.toString("base64")}` : null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: BRAND.ink, fontFamily: OG_FONT_FAMILY }}>
      {src && (
        <img src={src} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          background: src
            ? "linear-gradient(180deg, rgba(13,27,61,0.15) 0%, rgba(13,27,61,0.4) 45%, rgba(13,27,61,0.92) 100%)"
            : BRAND.ink,
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PMark size={60} />
          <div style={{ display: "flex", fontSize: 24, fontWeight: 900, letterSpacing: 5, color: BRAND.paper }}>PORTPASS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: name.length > 28 ? 56 : 68, fontWeight: 900, letterSpacing: -1.2, lineHeight: 1.05, color: BRAND.paper, maxWidth: 1000 }}>{name}</div>
          {tagline && <div style={{ display: "flex", fontSize: 28, color: "#C9D3E6", maxWidth: 900, lineHeight: 1.3, fontFamily: "sans-serif" }}>{tagline}</div>}
          <div style={{ display: "flex", fontSize: 22, fontWeight: 900, color: BRAND.sky, marginTop: 6 }}>portpassbahamas.com</div>
        </div>
      </div>
    </div>
  );
}
