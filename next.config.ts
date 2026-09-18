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
      {
        source: "/futprep/messy-tots",
        destination: "/futprep/programs",
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
    ];
  },
};

export default nextConfig;
