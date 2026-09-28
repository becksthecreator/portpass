import { suggestForWhiteText } from "@/lib/color";

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
}: {
  logoUrl?: string | null;
  name: string;
  brand: string;
  size?: "sm" | "md" | "lg";
  mark?: string;
}) {
  if (logoUrl) {
    return <img className={`biz-logo biz-logo-${size}`} src={logoUrl} alt={`${name} logo`} loading="lazy" />;
  }
  return (
    <span
      className={`biz-logo biz-logo-${size} biz-logo-wordmark${mark ? " biz-logo-wordmark-lockup" : ""}`}
      style={{ "--brand": suggestForWhiteText(brand) ?? brand } as React.CSSProperties}
    >
      {mark && <span className="biz-logo-mark" aria-hidden="true">{mark}</span>}
      {name}
    </span>
  );
}
