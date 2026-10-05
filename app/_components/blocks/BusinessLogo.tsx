import Image from "next/image";
import { suggestForWhiteText } from "@/lib/color";
import { isOptimisableSrc } from "@/lib/images";

// The box each size is drawn in (the CSS sets the same); "lg" is also
// stretched to 160px wide on a coming-soon card.
const LOGO_PX = { sm: 32, md: 44, lg: 160 } as const;

// A business's logo, or a wordmark tile at the same dimensions until one
// exists: the name set in Fraunces on a tile tinted with that business's
// own --brand. When a real logo file arrives, it drops into the same slot
// (same size prop, same call site) with no layout change. The tile carries
// white text, so the brand is darkened until that reads at 4.5:1 (the
// platform coral itself only manages 2.9:1).
export function BusinessLogo({
  logoUrl,
  name,
  brand,
  size = "md",
  mark,
  initialsOnly = false,
}: {
  logoUrl?: string | null;
  name: string;
  brand: string;
  size?: "sm" | "md" | "lg";
  mark?: string;
  // For tiles that print the name right next to the logo slot (carousel
  // tiles, open-now cards): initials on the tinted tile instead of the
  // full name, so it never reads twice.
  initialsOnly?: boolean;
}) {
  if (logoUrl) {
    // Its box is known before it loads, so nothing moves; a logo from our
    // own files or storage is resized to the box and served as AVIF/WebP.
    const px = LOGO_PX[size];
    if (isOptimisableSrc(logoUrl) && !/\.svg(\?|$)/i.test(logoUrl)) return <Image className={`biz-logo biz-logo-${size}`} src={logoUrl} alt={`${name} logo`} width={px} height={px} />;
    return <img className={`biz-logo biz-logo-${size}`} src={logoUrl} alt={`${name} logo`} width={px} height={px} loading="lazy" decoding="async" />;
  }
  const label = initialsOnly ? initialsOf(name) : name;
  return (
    <span
      className={`biz-logo biz-logo-${size} biz-logo-wordmark${mark ? " biz-logo-wordmark-lockup" : ""}${initialsOnly ? " biz-logo-initials" : ""}`}
      style={{ "--brand": suggestForWhiteText(brand) ?? brand } as React.CSSProperties}
      aria-label={initialsOnly ? `${name} logo` : undefined}
    >
      {mark && <span className="biz-logo-mark" aria-hidden="true">{mark}</span>}
      {label}
    </span>
  );
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(by|the|of|and|&)$/i.test(w));
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
