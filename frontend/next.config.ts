import type { NextConfig } from "next";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const baseUrl = rawApiUrl ? rawApiUrl.replace(/\/$/, "") : "";

const nextConfig: NextConfig = {
  trailingSlash: true,
  async rewrites() {
    if (!baseUrl) {
      return [];
    }

    return [{
      source: "/api/:path*",
      destination: `${baseUrl}/api/:path*`,
    }];
  }
};

export default nextConfig;
