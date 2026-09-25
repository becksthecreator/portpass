import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.squarespace-cdn.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async redirects() {
    return [
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
        destination: "/weddings/bahamas-weddings-by-the-sea",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
