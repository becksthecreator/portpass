// The PortPass P mark for next/og ImageResponse cards (Aragonite brand,
// 28 Sept): a gold circle with an ink italic "P". Satori needs explicit
// flex on anything with children, hence the styles here rather than a
// class. Keep in step with public/favicon.svg, app/apple-icon.tsx,
// app/icons/[size]/route.tsx and .brand-mark in app/globals.css.
export const BRAND = {
  ink: "#0B2A3C",
  gold: "#FFC21A",
  tealDeep: "#00737A",
  teal: "#00A6A6",
  aqua: "#5FD4D4",
  sand: "#F5F1E8",
  paper: "#FFFFFF",
  muted: "#5B6B75",
} as const;

export function PMark({ size = 72 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: BRAND.gold,
        color: BRAND.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.58),
        fontStyle: "italic",
        fontWeight: 800,
        fontFamily: "Georgia, serif",
      }}
    >
      P
    </div>
  );
}

// The light card background shared by the PortPass-branded share images:
// sand into paper into a breath of aqua.
export const OG_LIGHT_BACKGROUND = "linear-gradient(160deg,#F5F1E8 0%,#FFFFFF 52%,#D8F3F3 100%)";
