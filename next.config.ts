import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared MG Apparel kit ships TypeScript source; Next compiles it.
  transpilePackages: ["@metis/ui"],
  // No Next.js dev badge (it sits on top of the sidebar).
  devIndicators: false,
};

export default nextConfig;