import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js uses worker threads + WASM; keep it external so Next doesn't
  // try to bundle it into the server build (OCR runs in operator-side actions).
  serverExternalPackages: ["tesseract.js"],
  experimental: {
    // Seller verification uploads a live item photo through a server action;
    // bump the request body limit above the 1 MB default for camera images.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
