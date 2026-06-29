import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js uses worker threads + WASM; keep it external so Next doesn't
  // try to bundle it into the server build (OCR runs in operator-side actions).
  serverExternalPackages: ["tesseract.js"],
  // OCR loads the worker, core wasm and language data from node_modules at
  // runtime via dynamic paths, which file-tracing can't detect — force-include
  // them in the operator review route bundles so OCR works on Vercel.
  outputFileTracingIncludes: {
    "/operator/reviews/buyers": [
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/dist/**",
    ],
    "/operator/reviews/sellers": [
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/tesseract.js/dist/**",
    ],
  },
  experimental: {
    // Seller verification uploads a live item photo through a server action;
    // bump the request body limit above the 1 MB default for camera images.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
