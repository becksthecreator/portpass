import Link from "next/link";

const benefits = [
  ["01", "One clear home base", "Keep club operations, player details, and day-to-day coordination together."],
  ["02", "Less admin, more sport", "Replace scattered forms and spreadsheets with simple, reliable workflows."],
  ["03", "Built for your community", "Give coaches, parents, and players the right information at the right time."],
  ["04", "Ready to grow", "Start with what your organization needs today and build from there."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="PortPass home">
          <span className="brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <Link className="header-link" href="/apply">Early access ↗</Link>
      </header>

      <Link className="live-pilot-banner" href="/futprep/lil-kickers">
        <span>Now registering</span>
        <strong>Futprep Lil Kickers · Term 1</strong>
        <span>View program →</span>
      </Link>

      <section className="hero">
        <div className="hero-grid">
          <div className="eyebrow"><span className="eyebrow-dot" />Built in The Bahamas</div>
          <h1>Your club.<br/><em>Better connected.</em></h1>
          <div className="hero-side">
            <p>PortPass gives sports clubs and academies one simple place to organize, communicate, and grow.</p>
            <Link className="primary-button" href="/apply">Apply for early access →</Link>
          </div>
        </div>
        <figure className="hero-photo" aria-label="Tennis ball caught in a tennis net">
          <img
            src="https://images.unsplash.com/photo-1661881545067-b15c94c6b7cd?auto=format&fit=crop&w=1800&q=85"
            alt="Close-up tennis ball caught in a tennis net"
          />
          <figcaption>Photo by cal gao · Unsplash</figcaption>
        </figure>
        <div className="court-lines" aria-hidden="true"><span/><span/><span/></div>
      </section>

      <section className="benefits">
        <div className="section-kicker">Why PortPass</div>
        <div className="benefits-heading">
          <h2>Built for the people<br/>who make sport happen.</h2>
          <p>From first registration to the final whistle, PortPass helps your organization run with more clarity and less friction.</p>
        </div>
        <div className="benefit-grid">
          {benefits.map(([number,title,copy]) => (
            <article className="benefit-card" key={number}>
              <span className="card-number">{number}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-cta">
        <p>Early access is open.</p>
        <h2>Bring your organization on board.</h2>
        <Link className="light-button" href="/apply">Apply for early access →</Link>
      </section>

      <footer>
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <p>Made for sport in The Bahamas.</p>
        <Link href="/admin">Admin</Link>
      </footer>
    </main>
  );
}
