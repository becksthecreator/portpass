// Shared Open Graph card for organization pages: hero photo (when there is
// one Satori can decode), business name, the P mark. Rendered through
// next/og's ImageResponse, which has two constraints worth knowing before
// editing: every element with more than one child needs display:flex, and
// images must be PNG or JPEG -- no WebP, which is why the BWS card reads
// hero.jpg rather than the page's own bws-10.webp.
export type OgPhoto = { data: ArrayBuffer | Buffer; mime: "image/jpeg" | "image/png" };

export function OrgOgCard({ name, tagline, photo }: { name: string; tagline?: string | null; photo?: OgPhoto | null }) {
  const bytes = photo ? (Buffer.isBuffer(photo.data) ? photo.data : Buffer.from(photo.data)) : null;
  const src = photo && bytes ? `data:${photo.mime};base64,${bytes.toString("base64")}` : null;
  const ink = src ? "#ffffff" : "#14303d";
  const soft = src ? "#e6eef0" : "#43524f";
  const faint = src ? "#cfdadf" : "#5a6b64";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#14303d", fontFamily: "sans-serif" }}>
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
            ? "linear-gradient(180deg, rgba(20,48,61,0.12) 0%, rgba(20,48,61,0.35) 45%, rgba(20,48,61,0.9) 100%)"
            : "linear-gradient(160deg,#f6d2ac 0%,#efe7d9 55%,#d6ecea 100%)",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50% 50% 47% 53%",
              background: "#e8794a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontStyle: "italic",
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 5, color: ink }}>PORTPASS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: name.length > 28 ? 56 : 68, fontWeight: 600, lineHeight: 1.05, color: ink, maxWidth: 1000 }}>{name}</div>
          {tagline && <div style={{ display: "flex", fontSize: 28, color: soft, maxWidth: 900, lineHeight: 1.3 }}>{tagline}</div>}
          <div style={{ display: "flex", fontSize: 22, color: faint, marginTop: 6 }}>Book it on portpassbahamas.com</div>
        </div>
      </div>
    </div>
  );
}
