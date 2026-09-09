import Link from "next/link";

const roles = [
  ["01", "Club leaders", "Programs, registrations, payments, schedules, locations, and staff in one operating view."],
  ["02", "Coaches", "Rosters, attendance, session plans, player information, and the details needed on the field."],
  ["03", "Parents", "Clear registration, payment information, schedules, confirmations, and club updates."],
  ["04", "Players", "A cleaner path from joining a program to showing up ready to play."],
];

export default function Home() {
  return (
    <main className="landing-page">
      <section className="landing-hero" id="home">
        <div className="landing-hero-media" aria-hidden="true">
          <img
            className="landing-hero-slide landing-hero-slide-one"
            src="https://images.unsplash.com/photo-1661881545067-b15c94c6b7cd?auto=format&fit=crop&w=2200&q=88"
            alt=""
          />
          <img
            className="landing-hero-slide landing-hero-slide-two"
            src="https://images.unsplash.com/photo-1748606327306-5c518f0a6cfa?auto=format&fit=crop&w=2200&q=88"
            alt=""
          />
        </div>
        <div className="landing-hero-shade" aria-hidden="true" />

        <header className="landing-nav">
          <Link className="landing-brand" href="/" aria-label="PortPass home">
            <span className="landing-brand-mark">P</span>
            <span>PORTPASS</span>
          </Link>

          <nav className="landing-nav-links" aria-label="Primary navigation">
            <a className="is-active" href="#home">Home</a>
            <a href="#features">Features</a>
            <a href="#live">Live</a>
            <a href="#about">About</a>
            <Link href="/futprep">Futprep</Link>
            <Link href="/apply">Early access</Link>
          </nav>
        </header>

        <Link className="landing-register-strip" href="/futprep/lil-kickers">
          <span className="landing-register-label">Now registering</span>
          <strong>Futprep Lil Kickers · Term 1</strong>
          <span className="landing-register-action">View program →</span>
        </Link>

        <div className="landing-hero-content">
          <span className="landing-hero-kicker">Sports management · The Bahamas</span>
          <h1>Your club.<br/><em>Better connected.</em></h1>
          <p>One simple place for sports organizations to organize, communicate, register, and grow.</p>
          <div className="landing-hero-actions">
            <Link className="landing-button landing-button-primary" href="/apply">Apply for early access →</Link>
            <a className="landing-text-link" href="#features">Explore PortPass ↓</a>
          </div>
        </div>

        <div className="landing-hero-caption" aria-hidden="true">
          <span>01</span><i />
          <span>02</span>
        </div>
      </section>

      <section className="landing-systems" id="features">
        <div className="landing-section-heading">
          <span>What PortPass brings together</span>
          <h2>One place for your club.</h2>
        </div>

        <div className="landing-system-grid">
          <article className="landing-system-card">
            <div className="landing-system-visual landing-system-visual-ops" aria-hidden="true">
              <div className="landing-ui-shell">
                <div className="landing-ui-sidebar">
                  <span className="landing-ui-logo">P</span>
                  <i /><i /><i /><i />
                </div>
                <div className="landing-ui-main">
                  <div className="landing-ui-top"><span /><span /></div>
                  <div className="landing-ui-stats"><b /><b /><b /></div>
                  <div className="landing-ui-lines"><i /><i /><i /><i /></div>
                </div>
              </div>
            </div>
            <div className="landing-system-copy">
              <h3>Run your organization.</h3>
              <p>Replace scattered forms, chats, spreadsheets, and payment notes with one clear operating system.</p>
              <div className="landing-tags">
                <span>Programs</span><span>Registrations</span><span>Payments</span>
              </div>
              <a href="#about">Explore operations →</a>
            </div>
          </article>

          <article className="landing-system-card">
            <div className="landing-system-visual landing-system-visual-connect" aria-hidden="true">
              <div className="landing-connect-board">
                <div className="landing-connect-person"><span>C</span><small>Coach</small></div>
                <div className="landing-connect-line landing-connect-line-a" />
                <div className="landing-connect-person"><span>P</span><small>Parent</small></div>
                <div className="landing-connect-line landing-connect-line-b" />
                <div className="landing-connect-person"><span>PL</span><small>Player</small></div>
              </div>
            </div>
            <div className="landing-system-copy">
              <h3>Keep everyone connected.</h3>
              <p>Give coaches, parents, players, and club staff the right information without creating more admin.</p>
              <div className="landing-tags">
                <span>Schedules</span><span>Attendance</span><span>Updates</span>
              </div>
              <a href="#about">Explore the community →</a>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-roles" id="about">
        <div className="landing-roles-intro">
          <span className="landing-section-label">Built around real sport</span>
          <h2>The people who make the club happen.</h2>
          <p>PortPass is designed around how a sports organization actually works—from the office to the sideline to the family at home.</p>
        </div>
        <div className="landing-role-grid">
          {roles.map(([number, title, copy]) => (
            <article className="landing-role-card" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-live" id="live">
        <div className="landing-live-image">
          <img
            src="https://images.squarespace-cdn.com/content/v1/5ff2226296a9ec7fa1402a39/d69eda54-1539-434e-bb0c-7e122dd03eab/IMG_5805.jpg"
            alt="Futprep Athletics players together on the field"
            loading="lazy"
          />
        </div>
        <div className="landing-live-copy">
          <span className="landing-live-badge">Live on PortPass</span>
          <p className="landing-live-overline">First live program</p>
          <h2>Futprep Athletics<br/>Lil Kickers.</h2>
          <p>Parents can already view the program, choose a class, register a child, select a payment method, and receive confirmation through PortPass.</p>
          <div className="landing-live-tags">
            <span>Term 1</span>
            <span>Ages 3–7</span>
            <span>Saturday sessions</span>
          </div>
          <Link className="landing-button landing-button-dark" href="/futprep/lil-kickers">View live registration →</Link>
        </div>
      </section>

      <section className="landing-final">
        <span>Early access is open.</span>
        <h2>Run your club differently.</h2>
        <p>Bring your organization onto PortPass and help shape the platform being built for sport in The Bahamas.</p>
        <Link className="landing-button landing-button-lime" href="/apply">Apply for early access →</Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand landing-footer-brand" href="/">
          <span className="landing-brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <p>Made for sport in The Bahamas.</p>
        <div>
          <a href="#home">Back to top ↑</a>
          <Link href="/admin">Admin</Link>
        </div>
      </footer>
    </main>
  );
}
