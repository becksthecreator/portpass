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
    return <img className={`biz-logo biz-logo-${size}`} src={logoUrl} alt={`${name} logo`} loading="lazy" />;
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
