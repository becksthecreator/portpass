import Link from "next/link";
import { bwsSerif, bwsSans } from "./fonts";
import { MobileMenu } from "./MobileMenu";
import { QuickEnquiryForm } from "./QuickEnquiryForm";
import { GalleryCycle } from "./GalleryCycle";
import { BwsArrival } from "./BwsArrival";
import { PackageTiers } from "./PackageTiers";
import { getPublicWeddingGallery, getWeddingSiteSettings } from "@/db/weddingSite";
import { getPublicWeddingPackages } from "@/db/weddingPackages";

// force-dynamic (not ISR/revalidate) because this repo's CI build has no
// Supabase credentials, so a statically-prerendered page would fail the
// build fetching the gallery, site settings, and packages.
export const dynamic = "force-dynamic";

const ASSET = "/weddings/bahamas-by-the-sea";
const WEDDINGWIRE_URL = "https://www.weddingwire.com/biz/bahamas-weddings-by-the-sea-nassau/406f00580a64e27e.html";

const OG_IMAGE = `${ASSET}/hero.jpg`;

export const metadata = {
  title: "Bahamas Weddings By The Sea | Antonio Beckford",
  description: "A wedding that feels like you, in a place like nowhere else. Plan your Bahamas wedding ceremony or vow renewal with Antonio Beckford.",
  // Explicit override: the root layout sets a static `icons` field for
  // PortPass's own favicon, which otherwise wins over this route's
  // icon.tsx file convention in Next.js metadata merging.
  icons: { icon: `${ASSET}/icon` },
  openGraph: {
    title: "Bahamas Weddings By The Sea | Antonio Beckford",
    description: "A wedding that feels like you, in a place like nowhere else. Plan your Bahamas wedding ceremony or vow renewal with Antonio Beckford.",
    url: "/weddings/bahamas-by-the-sea",
    siteName: "Bahamas Weddings By The Sea",
    images: [{ url: OG_IMAGE, width: 1920, height: 1280 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bahamas Weddings By The Sea | Antonio Beckford",
    description: "A wedding that feels like you, in a place like nowhere else.",
    images: [OG_IMAGE],
  },
};

const NAV_LINKS = [
  { href: "#antonio", label: "Meet Antonio" },
  { href: "#wedding-desk", label: "Wedding Desk" },
  { href: "#add-ons", label: "Photo & film" },
  { href: "#love-notes", label: "Gallery" },
];

export default async function BahamasWeddingsByTheSeaPage() {
  const year = new Date().getFullYear();
  const [gallery, siteSettings, packages] = await Promise.all([
    getPublicWeddingGallery(),
    getWeddingSiteSettings(),
    getPublicWeddingPackages(),
  ]);
  return (
    <div className={`bws-theme ${bwsSerif.variable} ${bwsSans.variable}`} data-world="weddings">
      <BwsArrival />
      <a className="bws-skip-link" href="#main">Skip to content</a>
      <header className="bws-site-header" id="site-header">
        <nav className="bws-desktop-nav" aria-label="Main navigation">
          {NAV_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <a className="bws-brand" href="#home" aria-label="Bahamas Weddings By The Sea home">
          <span className="bws-brand-mark" aria-hidden="true">🌴</span>
          <span>Bahamas</span><small>WEDDINGS BY THE SEA</small>
        </a>
        <div className="bws-header-cta">
          <Link className="bws-nav-cta" href="/weddings/bahamas-by-the-sea/plan">Plan your wedding <span aria-hidden="true">↗</span></Link>
        </div>
        <MobileMenu links={[...NAV_LINKS, { href: "/weddings/bahamas-by-the-sea/plan", label: "Plan your wedding" }]} />
      </header>

      <main id="main">
        <section className="bws-hero" id="home" aria-labelledby="hero-title">
          <img className="bws-hero-image" src={`${ASSET}/hero.jpg`} alt="A floral wedding arch overlooking turquoise water on Paradise Island" width={1920} height={1280} fetchPriority="high" />
          <div className="bws-hero-content">
            <span className="bws-hero-badge">Nassau, The Bahamas</span>
            <h1 id="hero-title">A love like yours.<br /><em>A place like this.</em></h1>
            <p className="bws-hero-intro">The sea. The moment. The two of you.<br />A personal island ceremony, with Antonio Beckford.</p>
            <Link className="bws-hero-cta bws-button bws-button-light" href="/weddings/bahamas-by-the-sea/plan">Plan your wedding <span aria-hidden="true">↗</span></Link>
            <div className="bws-hero-signpost">
              <span><b>{siteSettings.yearsExperience}</b>years officiating</span>
              <span><b>{siteSettings.reviewCount}</b>five-star reviews</span>
              <span><b>Nassau</b>ceremonies &amp; vow renewals</span>
            </div>
          </div>
          <div className="bws-hero-foot">
            <p>Destination weddings <span>/</span> Vow renewals</p>
            <a href="#antonio">A little closer to &ldquo;I do&rdquo; <span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <section className="bws-trust-strip" aria-label="Experience and recognition">
          <div><strong>{siteSettings.yearsExperience}+</strong><span>Years of experience</span></div>
          <a href={WEDDINGWIRE_URL} target="_blank" rel="noopener noreferrer"><strong>5.0 <span className="bws-stars" aria-label="out of five stars">★★★★★</span></strong><span>{siteSettings.reviewCount} reviews · Recommended by {siteSettings.reviewRecommendPct}% of couples ↗</span></a>
          <div><strong>{siteSettings.awardYears.length || 6} Couples&rsquo; Choice Awards</strong><span>WeddingWire, {siteSettings.awardYears.length ? [...siteSettings.awardYears].sort((a, b) => a - b).join(", ") : "2019–2026"}</span></div>
        </section>

        <section className="bws-gallery-cycle-section" id="love-notes">
          <GalleryCycle images={gallery} />
          <div className="bws-gallery-cycle-caption">
            <p className="bws-eyebrow">Real island weddings</p>
            <h2>A little colour<br /><em>from the water&rsquo;s edge.</em></h2>
          </div>
        </section>

        <section className="bws-about bws-section-wrap" id="antonio">
          <div className="bws-about-photo">
            <img src={`${ASSET}/antonio.jpg`} alt="Antonio Beckford, wedding planner and officiant" width={361} height={361} loading="lazy" />
            <span className="bws-photo-label">Your person in paradise.</span>
          </div>
          <div className="bws-about-copy">
            <p className="bws-eyebrow">Meet your officiant</p>
            <h2>A familiar face,<br /> before you even<br /><em>reach the island.</em></h2>
            <p>Planning a wedding from another country starts with finding someone you can trust.</p>
            <p>Meet Antonio Beckford, the planner and licensed officiant behind Bahamas Weddings By The Sea. With more than 26 years of experience, he brings a personal touch to your ceremony and clear guidance to the planning.</p>
            <p>From your first questions to the words you say at the water&rsquo;s edge, there&rsquo;s room for what matters to you.</p>
            <div className="bws-signature">Antonio Beckford</div>
            <p className="bws-signature-caption">Planner. Officiant. Your island connection.</p>
            <a className="bws-text-link" href="#enquire">Tell Antonio your story <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section className="bws-tiers bws-section-wrap" id="packages">
          <div className="bws-section-heading">
            <div><p className="bws-eyebrow">How much should we handle?</p><h2>Choose your<br /><em>package.</em></h2></div>
            <p>Real prices, published by Antonio. Choosing one here doesn&rsquo;t confirm or book anything — it just tells the Wedding Desk where to start.</p>
          </div>
          <PackageTiers packages={packages} />
        </section>

        {/*
          Reviews render only through the official WeddingWire widget (never
          copied review text — that content belongs to the couples and to
          WeddingWire, and republishing it is a rights problem). Antonio
          supplies the embed HTML himself from WeddingPro.com → Reviews →
          Reviews Widget, pasted in once via the wedding admin.
        */}
        {siteSettings.reviewsWidgetHtml && (
          <section className="bws-reviews-widget bws-section-wrap" aria-label="Reviews from couples on WeddingWire">
            <div className="bws-section-heading">
              <div><p className="bws-eyebrow">What couples say</p><h2>Straight from<br /><em>WeddingWire.</em></h2></div>
            </div>
            <div dangerouslySetInnerHTML={{ __html: siteSettings.reviewsWidgetHtml }} />
          </section>
        )}

        <section className="bws-add-ons" id="add-ons">
          <div className="bws-section-wrap">
            <div className="bws-section-heading">
              <div><p className="bws-eyebrow">Tell the whole story</p><h2>Remember the feeling.<br /><em>Relive the moment.</em></h2></div>
              <p>Photo, film, travel, and Registrar support can be added to your request. Availability and pricing are confirmed before booking.</p>
            </div>
            <div className="bws-addon-grid">
              <Link className="bws-addon-card bws-photo-card" href="/weddings/bahamas-by-the-sea/plan?service=Cinematic%20photo%20story"><span>Photography</span><h3>Cinematic Photo Story</h3><p>Ask for ceremony photography and the moments around it.</p><b>Request availability ↗</b></Link>
              <Link className="bws-addon-card bws-film-card" href="/weddings/bahamas-by-the-sea/plan?service=Cinematic%20highlight%20film"><span>Film</span><h3>Cinematic Highlight</h3><p>A short wedding film shaped around the feeling of your day.</p><b>Request availability ↗</b></Link>
              <Link className="bws-addon-card bws-video-card" href="/weddings/bahamas-by-the-sea/plan?service=Full%20ceremony%20film"><span>Video</span><h3>Full Ceremony Film</h3><p>Request a complete recording so every word is preserved.</p><b>Request availability ↗</b></Link>
              <Link className="bws-addon-card bws-registrar-card" href="/weddings/bahamas-by-the-sea/plan?service=Registrar%20appointment%20coordination"><span>Planning</span><h3>Registrar &amp; Transport</h3><p>Ask for help coordinating appointments and island transportation.</p><b>Request support ↗</b></Link>
            </div>
            <p className="bws-availability-note">Creative and transport services are quoted according to the date, location, coverage, and available team.</p>
          </div>
        </section>

        <section className="bws-wedding-desk" id="wedding-desk">
          <div className="bws-section-wrap">
            <div className="bws-desk-heading">
              <div><p className="bws-eyebrow">Your planning team in The Bahamas</p><h2>How the<br /><em>Wedding Desk</em> works.</h2></div>
              <div>
                <p>You don&rsquo;t need every detail figured out to start. The Wedding Desk shapes the details before Antonio reviews your complete wedding plan.</p>
                <Link className="bws-button bws-button-light" href="/weddings/bahamas-by-the-sea/plan">Start your pre-consultation <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
            <ol className="bws-desk-flow">
              <li><span>01</span><h3>Tell us what you imagine</h3><p>Choose your ceremony, preferred date, guest count, and support — message the Wedding Desk or use the guided planner from anywhere.</p></li>
              <li><span>02</span><h3>Build your shortlist</h3><p>Explore packages, venues, photo, film, transport, and ceremony support.</p></li>
              <li><span>03</span><h3>Meet your representative</h3><p>Request a planning call, WhatsApp video conversation, or guided text consultation.</p></li>
              <li><span>04</span><h3>Antonio reviews the plan</h3><p>Your organized wedding plan goes to Antonio for approval, availability, and a personal quote.</p></li>
            </ol>
            <p className="bws-desk-note">Antonio remains your officiant and the heart of the ceremony. The Wedding Desk handles the planning details around him.</p>
          </div>
        </section>

        <section className="bws-faq bws-section-wrap" id="questions">
          <div>
            <p className="bws-eyebrow">A little peace of mind</p>
            <h2>Before you<br /> <em>pack your bags.</em></h2>
            <p>Planning from overseas?<br /> Let&rsquo;s start with your questions.</p>
          </div>
          <div className="bws-faq-list">
            <details><summary>Can we plan everything before we arrive?<span aria-hidden="true">+</span></summary><p>Start with the Wedding Desk from wherever you live. Share your travel plans, ceremony ideas, and questions so the team can prepare your consultation and organize the plan for Antonio.</p></details>
            <details><summary>What about the marriage licence?<span aria-hidden="true">+</span></summary><p>A legal wedding requires a Bahamian marriage licence. Allow time for the application and approval before your ceremony, and discuss your arrival dates and documents with the team before finalizing travel. Cruise itineraries also need careful timing. <a href="https://www.bahamas.com/plan-your-trip/weddings/marriage-license" target="_blank" rel="noopener noreferrer">Read the official Bahamas marriage requirements ↗</a></p></details>
            <details><summary>Can our ceremony reflect our beliefs?<span aria-hidden="true">+</span></summary><p>Antonio offers nonreligious and interfaith ceremonies. Tell the Wedding Desk about the traditions, readings, and personal touches you would like included. Optional premarital counselling may also be requested.</p></details>
            <details><summary>How much does a ceremony cost?<span aria-hidden="true">+</span></summary><p>Ask for a personal quote based on your date, location, guest count, and the services you need. Antonio reviews the completed plan before availability, pricing, inclusions, and booking terms are confirmed.</p></details>
            <details><summary>Does an enquiry reserve our date?<span aria-hidden="true">+</span></summary><p>No. An enquiry starts the pre-consultation. The Wedding Desk organizes your plan, then Antonio confirms availability and provides the next steps. A date is reserved only after the booking terms are agreed.</p></details>
          </div>
        </section>

        <section className="bws-enquiry" id="enquire">
          <div className="bws-enquiry-inner">
            <div className="bws-enquiry-copy">
              <p className="bws-eyebrow">Your next chapter</p>
              <h2>It starts with<br /><em>a hello.</em></h2>
              <p>Tell Antonio a little about the two of you and the day you&rsquo;re dreaming of. He&rsquo;ll take the conversation from there.</p>
              <a className="bws-contact-number" href="tel:+12424241262">+1 (242) 424-1262 <span aria-hidden="true">↗</span></a>
              <p className="bws-contact-caption">Call or WhatsApp Antonio</p>
              <div className="bws-enquiry-note">Nassau, The Bahamas<br /><span>Destination ceremonies with a personal touch.</span></div>
            </div>
            <div className="bws-enquiry-form-wrap">
              <QuickEnquiryForm />
              <a className="bws-weddingwire-option" href={WEDDINGWIRE_URL} target="_blank" rel="noopener noreferrer">Prefer WeddingWire? Enquire through his profile ↗</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bws-site-footer">
        <div className="bws-footer-top">
          <a className="bws-brand" href="#home" aria-label="Back to home"><span>Bahamas</span><small>WEDDINGS BY THE SEA</small></a>
          <p>A love like yours. A place like this.</p>
          <a href="#home" className="bws-back-top">Back to the top ↑</a>
        </div>
        <div className="bws-footer-bottom">
          <span>© {year} Bahamas Weddings By The Sea</span>
          <span>Antonio Beckford · Nassau, The Bahamas</span>
          <span>Planning desk managed by the Wedding Desk</span>
          <a href={WEDDINGWIRE_URL} target="_blank" rel="noopener noreferrer">Photos &amp; review via WeddingWire ↗</a>
        </div>
        <p className="bws-rating-note">WeddingWire rating and review count checked September 2026. Enquiries open in WhatsApp for you to review and send.</p>
        <p className="bws-vendor-credit">Booking and planning desk powered by <Link href="/">PortPass Bahamas</Link>.</p>
      </footer>

      <Link className="bws-mobile-booking" href="/weddings/bahamas-by-the-sea/plan">Plan your wedding <span aria-hidden="true">↗</span></Link>
    </div>
  );
}
