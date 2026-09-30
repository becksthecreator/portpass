import { BRAND, OG_FONT_FAMILY, PMark } from "./PMark";

// The PortPass share card (Harbour Signal, 28 Sept): navy ground, the
// mark on the left, the page title in Archivo 900 white, and
// "portpassbahamas.com" in sky. Every PortPass opengraph-image renders
// through this so they all move together.
export function OgCard({ title, subtitle, eyebrow }: { title: string; subtitle?: string | null; eyebrow?: string | null }) {
  const long = title.length > 40;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.ink, color: BRAND.paper, fontFamily: OG_FONT_FAMILY, padding: "72px 84px" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 200, flexShrink: 0 }}>
        <PMark size={120} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingLeft: 36 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow && <div style={{ display: "flex", fontSize: 24, fontWeight: 900, letterSpacing: 4, color: BRAND.sky, marginBottom: 22, textTransform: "uppercase" }}>{eyebrow}</div>}
          <div style={{ display: "flex", fontSize: long ? 58 : 72, fontWeight: 900, lineHeight: 1.04, letterSpacing: -1.5, color: BRAND.paper, maxWidth: 820 }}>{title}</div>
          {subtitle && <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: "#C9D3E6", marginTop: 26, maxWidth: 780, fontFamily: "sans-serif" }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: BRAND.sky, letterSpacing: 1 }}>portpassbahamas.com</div>
      </div>
    </div>
  );
}
