import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";
import { FUTPREP_REDIRECTS } from "./lib/futprepOffSite";

const nextConfig: NextConfig = {
  // The HTTP security headers, on every path (Brief 21, part D):
  // lib/securityHeaders.ts says what and why; lib/securityHeaders.test.ts
  // and scripts/security/headers-check.mjs keep them there.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
  // Photos are converted and resized on the server (lib/imageProcess.ts,
  // brief 19 part E): sharp is native code and the HEIC decoder is one
  // large WebAssembly file, so both are loaded as they are, not bundled.
  serverExternalPackages: ["sharp", "heic-decode", "libheif-js"],
  // The share cards (lib/og/PMark.tsx) read the Prow mark SVG from public/
  // at render time, so the file must travel with every opengraph-image
  // function on Vercel.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./public/brand/logo/portpass-mark-dark.svg"],
    "/**/opengraph-image": ["./public/brand/logo/portpass-mark-dark.svg"],
  },
  images: {
    // AVIF first, WebP second (speed brief, 29 Sept, 1.5); owner uploads
    // live in Supabase Storage, hence the wildcard supabase.co pattern.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.squarespace-cdn.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    return [
      // Futprep off PortPass's public pages (19 Nov 2026, Antonio): Futprep
      // stays one card in Sports & Fitness, and its page, class pages,
      // registration, camps, taster and booking send families to Futprep's
      // own site. Staff screens and PIN logins (/futprep/staff), families'
      // status lookup (/futprep/my), the owner dashboard (/business/futprep)
      // and every /api route stay as they are (rule 9). Not permanent: the
      // pages come back by deleting this block. First, so it wins over the
      // older /futprep rules below.
      // While FUTPREP_FORMS_ON_PORTPASS is on, the four form pages (register,
      // taster, camps, booking) stay here instead (23 Nov, Bex).
      ...FUTPREP_REDIRECTS.map(({ source, destination }) => ({ source, destination, has: [{ type: "host" as const, value: "^(www\\.)?portpassbahamas\\.com$" }], permanent: false })),
      // The business card's QR code (23 Nov 2026): it prints
      // portpassbahamas.com/card, which stays the same forever, and this
      // decides where a scan lands. Today (Bex, 23 Nov): the home page,
      // tagged so card scans are counted (Vercel Analytics keeps utm_source).
      // Temporary (307) so it can point somewhere else later without a
      // reprint, and so no browser or cache keeps the old target. PortPass's
      // own hosts and previews only; a business's custom domain is left alone.
      {
        source: "/card",
        destination: "/?utm_source=card&utm_medium=qr",
        has: [{ type: "host" as const, value: "^(www\\.)?portpassbahamas\\.com$|\\.vercel\\.app$" }],
        permanent: false,
      },
      // Futprep rebuilt on the shared Organization/Offering template --
      // its marketing pages now live under the sports-fitness category hub,
      // the same URL shape every future organization will use. The
      // registration flow itself (/futprep/register, /futprep/my/*) and the
      // staff portal (/futprep/staff/*) are unaffected and stay where they are.
      {
        source: "/futprep",
        destination: "/sports-fitness/futprep-athletics",
        permanent: true,
      },
      {
        source: "/futprep/programs",
        destination: "/sports-fitness/futprep-athletics",
        permanent: true,
      },
      {
        source: "/futprep/lil-kickers",
        destination: "/sports-fitness/futprep-athletics/lil-kickers",
        permanent: true,
      },
      {
        source: "/futprep/kickers",
        destination: "/sports-fitness/futprep-athletics/kickers",
        permanent: true,
      },
      {
        source: "/futprep/messy-tots",
        destination: "/sports-fitness/futprep-athletics",
        permanent: true,
      },
      // Futprep growth tracking (28 Sept): the short link for the Instagram
      // bio, tagged as a PortPass link so a registration from it is
      // attributable (see lib/attribution.ts FUTPREP_LINKS).
      {
        source: "/futprep/ig",
        destination: "/sports-fitness/futprep-athletics?utm_source=portpass&utm_medium=ig_bio&utm_campaign=term2_ig",
        permanent: false,
      },
      // Organization-level surfaces moved out from under the lil-kickers
      // program prefix (see go-live brief, section 1d). Query strings are
      // forwarded automatically, so ?program=/?returnTo= keep working.
      {
        source: "/futprep/lil-kickers/register",
        destination: "/futprep/register",
        permanent: true,
      },
      {
        source: "/futprep/lil-kickers/staff/:path*",
        destination: "/futprep/staff/:path*",
        permanent: true,
      },
      // Bahamas Weddings By The Sea consolidation (24 Sept brief): the
      // planner moved off the bespoke page onto the listing page it's
      // being merged into. Query strings (?tier=, ?ceremony=, ?service=)
      // forward automatically on a redirect with no :path* segment.
      {
        source: "/weddings/bahamas-by-the-sea/plan",
        destination: "/weddings/bahamas-weddings-by-the-sea/plan",
        permanent: true,
      },
      // Retiring the bespoke page itself (25 Sept brief, Part 2) -- the
      // listing page now carries full parity (content, gallery, reviews,
      // FAQ, planner), so this bespoke route and its components are deleted
      // rather than just orphaned.
      {
        source: "/weddings/bahamas-by-the-sea",
        destination: "/weddings/bahamas-weddings-by-the-sea",
        permanent: true,
      },
      // Same consolidation for the other mistaken duplicate (the "wrong
      // page" the 24 Sept brief opened with). Scoped to the platform host:
      // /sites/[slug] is also reached by rewriting a business's own
      // custom_domain to this same path (see middleware.ts), and a future
      // bahamas-weddings custom domain must keep rendering that page, not
      // bounce back to portpassbahamas.com.
      {
        source: "/sites/bahamas-weddings",
        has: [{ type: "host", value: "^(www\\.)?portpassbahamas\\.com$" }],
        destination: "https://bahamasweddingsbythesea.com/",
        statusCode: 301,
      },
      // Sports, fitness and gyms only (19 Oct 2026). On portpassbahamas.com
      // the wedding pages move to Bahamas Weddings By The Sea's own domain,
      // and PortPass Market, Drops and orders go back to the homepage. The
      // code stays: the wedding routes still serve that domain (middleware
      // lets /weddings through there), and none of the Market lines is
      // permanent, so a section can come back by deleting its lines here.
      // The wedding lines ARE permanent (301, 23 Nov): the pages belong to
      // Bahamas Weddings By The Sea's own domain for good, and a temporary
      // redirect kept Bing and Google listing the portpassbahamas.com copy
      // next to the client's domain. Browsers cache a 301, so undoing one
      // later takes a redirect back, not just deleting the line.
      ...[
        { source: "/weddings", destination: "https://bahamasweddingsbythesea.com/" },
        { source: "/weddings/bahamas-weddings-by-the-sea", destination: "https://bahamasweddingsbythesea.com/" },
        { source: "/weddings/:path*", destination: "https://bahamasweddingsbythesea.com/weddings/:path*" },
      ].map((rule) => ({ ...rule, has: [{ type: "host" as const, value: "^(www\\.)?portpassbahamas\\.com$" }], statusCode: 301 as const })),
      ...[
        { source: "/market", destination: "/" },
        { source: "/market/:path*", destination: "/" },
        { source: "/shop", destination: "/" },
        { source: "/shop/:path*", destination: "/" },
        { source: "/sell", destination: "/" },
        { source: "/sell/:path*", destination: "/" },
        { source: "/order/:path*", destination: "/" },
      ].map((rule) => ({ ...rule, has: [{ type: "host" as const, value: "^(www\\.)?portpassbahamas\\.com$" }], permanent: false })),
      // On Bahamas Weddings By The Sea's own domain, its home is the page
      // at "/" (app/sites/[slug]); the PortPass-chrome copy of the same page
      // sends couples there. The planner, staff desk and admin stay put.
      ...[
        { source: "/weddings", destination: "/" },
        { source: "/weddings/bahamas-weddings-by-the-sea", destination: "/" },
      ].map((rule) => ({ ...rule, has: [{ type: "host" as const, value: "^(www\\.)?bahamasweddingsbythesea\\.com$" }], statusCode: 301 as const })),
      // Events became a subsection of Entertainment (decided 27 Sept, for
      // the OWN Conference build); the old top-level placeholder is gone.
      {
        source: "/events",
        destination: "/entertainment/events",
        permanent: true,
      },
      // /own (the QR on the OWN Conference material) is a page now: the
      // 30-second sign-up form (brief 18, part C).
    ];
  },
};

export default nextConfig;
