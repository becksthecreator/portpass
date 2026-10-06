// Skeleton placeholders (brief 22, M5) for the public lists that fetch
// data. Each is built from the loaded card's own elements and classes,
// with neutral words of a typical length made invisible (.sk-text in
// lib/motion/public.css): every box is the size its real text will take,
// so the cards drop into the same places. A description longer or shorter
// than the typical one can still change a card's height by a line. The
// soft shimmer is a sweep by transform, off under reduced motion and the
// kill switch (a still grey box then). Decorative: hidden from readers,
// who get the list's own loading announcement. data-still keeps the M3
// lifts, squishes and pops off the placeholders.

export function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`sk ${className}`.trim()} style={style} aria-hidden="true" />;
}

// One "Open now" card: logo, chip and name (and the business behind a
// dated offer, for a camp's card), the live line and the button.
export function OpenNowCardSkeleton({ by = false }: { by?: boolean }) {
  return (
    <div className="open-now-card sk-card" data-still="" aria-hidden="true">
      <div className="open-now-head">
        <SkeletonBlock className="sk-logo" />
        <div>
          <span className="open-now-chip sk-text">Loading</span>
          <h3 className="sk-text">A business on PortPass</h3>
          {by && <span className="open-now-by sk-text">By a business on PortPass</span>}
        </div>
      </div>
      <p className="open-now-line sk-text">A line about what is on and when it runs</p>
      <span className="home-button sk-text" data-still="">Explore →</span>
    </div>
  );
}

// The strip while its cards are on their way, with exactly as many cards
// as it will hold; the camps' cards come first in the strip, so the first
// `camps` carry the extra line a dated offer has.
export function OpenNowSkeleton({ cards = 2, camps = 0 }: { cards?: number; camps?: number }) {
  return (
    <section className="open-now" id="open-now" aria-busy="true" aria-label="Open now on PortPass, loading">
      <div className="carousel-header">
        <h2>Open now on PortPass.</h2>
      </div>
      <div className="open-now-grid">
        {Array.from({ length: cards }, (_, i) => (
          <OpenNowCardSkeleton key={i} by={i < camps} />
        ))}
      </div>
    </section>
  );
}

// A category list card: the photo at the card's own height (the wide one
// when it is a section's only card), then label, logo and name, a typical
// description, a price and the button.
export function FeatureCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`feature-card${wide ? " feature-card-wide" : ""} sk-card`} data-still="" aria-hidden="true">
      <SkeletonBlock className="feature-card-photo sk-photo" />
      <div className="feature-card-body">
        <span className="feature-card-label sk-text">Loading</span>
        <div className="feature-card-heading">
          <SkeletonBlock className="sk-logo sk-logo-sm" />
          <h2 className="sk-text">A business on PortPass</h2>
        </div>
        <p className="feature-card-description sk-text">A line or two about the business and what it offers.</p>
        <p className="feature-card-price sk-text">Prices</p>
        <span className="feature-card-button sk-text" data-still="">Explore →</span>
      </div>
    </div>
  );
}
