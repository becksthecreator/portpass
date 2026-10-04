// Block 1 of 8 -- always renders. Name, category, location, open/closed.
// See claude/PortPass_Site_Architecture.md for the full block system.
//
// layout "overlay" (the default) puts white text over the photo with a
// dark gradient scrim -- works when the photo can carry dark-ish tones.
// layout "split" instead puts the photo and the text side by side, text on
// --paper, so it never sits ON the photo -- for a business whose photo is
// bright throughout (a beach ceremony) where an overlay would fight the
// image instead of reading cleanly.
export function IdentityBlock({
  name,
  category,
  location,
  isOpen,
  heroImageUrl,
  layout = "overlay",
  logoUrl = null,
  brandHeader = false,
}: {
  name: string;
  category: string | null;
  location: string | null;
  isOpen?: boolean;
  heroImageUrl?: string | null;
  layout?: "overlay" | "split";
  logoUrl?: string | null;
  // With no photo yet: a header in the business's own colour with its logo
  // (brief 18, G2), instead of a plain card. The colours come from the
  // page's theme variables, which keep the text readable.
  brandHeader?: boolean;
}) {
  const meta = [category, location].filter(Boolean).join(" · ");
  const badge = isOpen !== undefined && (
    <span className={`tpl-badge${isOpen ? "" : " tpl-badge-closed"}`}>{isOpen ? "Open now" : "Currently closed"}</span>
  );

  if (layout === "split" && heroImageUrl) {
    return (
      <section className="tpl-identity tpl-identity-split">
        <div className="tpl-identity-split-image" style={{ backgroundImage: `url(${heroImageUrl})` }} />
        <div className="tpl-identity-split-text">
          {badge}
          <h1>{name}</h1>
          {meta && <p className="tpl-identity-meta">{meta}</p>}
        </div>
      </section>
    );
  }

  if (!heroImageUrl && brandHeader) {
    return (
      <section className="tpl-identity tpl-identity-brand">
        <div className="tpl-identity-inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- a business's own logo, any size or host */}
          {logoUrl && <img className="tpl-identity-logo" src={logoUrl} alt={`${name} logo`} />}
          {badge}
          <h1>{name}</h1>
          {meta && <p className="tpl-identity-meta">{meta}</p>}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`tpl-identity${heroImageUrl ? " tpl-identity-photo" : ""}`}
      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
    >
      <div className="tpl-identity-inner">
        {badge}
        <h1>{name}</h1>
        {meta && <p className="tpl-identity-meta">{meta}</p>}
      </div>
    </section>
  );
}
