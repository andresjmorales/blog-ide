import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@gracious.tech/fetch-client",
    "@gracious.tech/bible-references",
  ],
};

export default nextConfig;
