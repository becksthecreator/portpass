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
    ];
  },
};

export default nextConfig;
