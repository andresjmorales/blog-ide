import type { NextConfig } from "next";

/**
 * Baseline hardening headers. No full script CSP yet (KaTeX, Harper WASM,
 * fetch.bible and pop-outs would each need entries); these are the ones that
 * cost nothing: no clickjacking frames, no MIME sniffing, no full-URL
 * referrers leaking essay IDs, and no device APIs the app never uses.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    "@gracious.tech/fetch-client",
    "@gracious.tech/bible-references",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
