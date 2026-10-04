import type { NextConfig } from "next";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const baseUrl = rawApiUrl ? rawApiUrl.replace(/\/$/, "") : "";

const nextConfig: NextConfig = {
  trailingSlash: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    if (!baseUrl) {
      return [];
    }

    return [{
      source: "/api/:path*",
      // :path* drops the trailing slash; Django needs it or it 301s back here in a loop.
      destination: `${baseUrl}/api/:path*/`,
    }];
  }
};

export default nextConfig;
