// Brand constants for next/og ImageResponse cards (Harbour Signal, 28
// Sept). Satori needs explicit flex on anything with children, hence the
// styles here rather than a class.
export const BRAND = {
  ink: "#0D1B3D",
  signal: "#D7232B",
  harbour: "#2463AE",
  deck: "#F5F6F8",
  paper: "#FFFFFF",
  muted: "#566174",
  tint: "#DCE6F3",
  sky: "#8DB8F2",
  line: "#DCE1E8",
} as const;

// The mark on a navy card. Interim: a white disc with the navy P until the
// Prow mark from PortPass-Logo-Files.zip is in public/brand/ (then this
// renders that SVG instead). Not a redrawing of the Prow -- deliberately
// the plain old mark, so nothing approximates the real logo.
export function PMark({ size = 72 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: BRAND.paper,
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

// Archivo 900 for the card titles. Satori can't read woff2 or a variable
// font's axes, so the static 900 woff from Fontsource (jsDelivr) is
// fetched once per instance and cached; a fetch failure falls back to the
// system sans rather than failing the image.
let archivoPromise: Promise<ArrayBuffer | null> | null = null;
export function archivoBlack(): Promise<ArrayBuffer | null> {
  if (!archivoPromise) {
    archivoPromise = fetch("https://cdn.jsdelivr.net/npm/@fontsource/archivo@5/files/archivo-latin-900-normal.woff", { cache: "force-cache" })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }
  return archivoPromise;
}

export async function ogFonts() {
  const data = await archivoBlack();
  return data ? [{ name: "Archivo", data, weight: 900 as const, style: "normal" as const }] : [];
}

export const OG_FONT_FAMILY = "Archivo, sans-serif";
