import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Strip trailing slash to prevent infinite redirect loops with Django APPEND_SLASH
    const baseUrl = process.env.NEXT_PUBLIC_API_URL 
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') 
      : 'http://localhost:8000';

    return [
      {
        source: '/api/:path*',
        destination: `${baseUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
