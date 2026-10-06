import type { NextConfig } from "next";

// Baseline protections SiteForge itself checks audited sites for.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
];

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audits": ["./.audit-worker/worker.cjs"],
    "/api/audits/*": ["./.audit-worker/worker.cjs"],
    "/api/worker": ["./.audit-worker/worker.cjs"],
  },
  output: "standalone",
  serverExternalPackages: ["playwright", "axe-core"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
