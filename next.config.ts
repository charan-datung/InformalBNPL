import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Seller verification uploads a live item photo through a server action;
    // bump the request body limit above the 1 MB default for camera images.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
