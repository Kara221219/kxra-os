import path from "node:path";

const productionHashes = (process.env.KXRA_MARKETING_SCRIPT_HASHES || "")
  .split(",")
  .filter(Boolean);
if (productionHashes.some((hash) => !/^[A-Za-z0-9+/]{43}=$/.test(hash)))
  throw new Error("Invalid marketing script hash");

export default {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: path.resolve("../.."),
  poweredByHeader: false,
  experimental: { sri: { algorithm: "sha256" } },
  generateBuildId: async () =>
    process.env.KXRA_MARKETING_BUILD_ID || "unverified-direct-build",
  async headers() {
    const scriptPolicy =
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : process.env.KXRA_MARKETING_CSP_MODE === "collect"
          ? "script-src 'self' 'unsafe-inline'"
          : `script-src 'self' ${productionHashes
              .map((hash) => `'sha256-${hash}'`)
              .join(" ")}`.trim();
    const policy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data:",
      "font-src 'self'",
      scriptPolicy,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};
