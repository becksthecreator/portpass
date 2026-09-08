import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
