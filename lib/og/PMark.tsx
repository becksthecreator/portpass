import { readFileSync } from "node:fs";
import path from "node:path";

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

// The Prow mark for a navy card: the delivered SVG file itself
// (public/brand/logo/portpass-mark-dark.svg, white ship on navy), read once
// and handed to Satori as a data URL. Never redrawn. If the file can't be
// read the card shows a plain white disc instead of failing the image.
let markDataUrl: string | null | undefined;
function prowMark(): string | null {
  if (markDataUrl !== undefined) return markDataUrl;
  try {
    const svg = readFileSync(path.join(process.cwd(), "public", "brand", "logo", "portpass-mark-dark.svg"), "utf8");
    markDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    markDataUrl = null;
  }
  return markDataUrl;
}

export function PMark({ size = 72 }: { size?: number }) {
  const src = prowMark();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: BRAND.paper,
        display: "flex",
      }}
    />
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
