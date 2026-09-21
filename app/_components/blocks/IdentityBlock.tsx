// Block 1 of 8 -- always renders. Name, category, location, open/closed.
// See claude/PortPass_Site_Architecture.md for the full block system.
export function IdentityBlock({
  name,
  category,
  location,
  isOpen,
  heroImageUrl,
}: {
  name: string;
  category: string | null;
  location: string | null;
  isOpen?: boolean;
  heroImageUrl?: string | null;
}) {
  const meta = [category, location].filter(Boolean).join(" · ");
  return (
    <section
      className={`tpl-identity${heroImageUrl ? " tpl-identity-photo" : ""}`}
      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
    >
      <div className="tpl-identity-inner">
        {isOpen !== undefined && (
          <span className={`tpl-badge${isOpen ? "" : " tpl-badge-closed"}`}>{isOpen ? "Open now" : "Currently closed"}</span>
        )}
        <h1>{name}</h1>
        {meta && <p className="tpl-identity-meta">{meta}</p>}
      </div>
    </section>
  );
}
