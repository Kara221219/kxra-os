import path from "node:path";

const productionHashes = (process.env.KXRA_MARKETING_SCRIPT_HASHES || "")
  .split(",")
  .filter(Boolean);
if (productionHashes.some((hash) => !/^[A-Za-z0-9+/]{43}=$/.test(hash)))
  throw new Error("Invalid marketing script hash");

const routeHashes = JSON.parse(
  process.env.KXRA_MARKETING_ROUTE_SCRIPT_HASHES || "{}",
);
if (
  !routeHashes ||
  Array.isArray(routeHashes) ||
  typeof routeHashes !== "object"
)
  throw new Error("Invalid marketing route hash map");
for (const [route, hashes] of Object.entries(routeHashes)) {
  if (
    !/^\/[a-zA-Z0-9_/-]*$/.test(route) ||
    route.includes("//") ||
    !Array.isArray(hashes) ||
    hashes.some((hash) => !/^[A-Za-z0-9+/]{43}=$/.test(hash))
  )
    throw new Error("Invalid marketing route script hash");
}

export default {
  devIndicators: false,
  distDir:
    process.env.KXRA_NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  outputFileTracingRoot: path.resolve("../.."),
  poweredByHeader: false,
  experimental: { sri: { algorithm: "sha256" } },
  generateBuildId: async () =>
    process.env.KXRA_MARKETING_BUILD_ID || "unverified-direct-build",
  async headers() {
    const scriptPolicyFor = (hashes) =>
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : process.env.KXRA_MARKETING_CSP_MODE === "collect"
          ? "script-src 'self' 'unsafe-inline'"
          : `script-src 'self' ${hashes
              .map((hash) => `'sha256-${hash}'`)
              .join(" ")}`.trim();
    const policyFor = (hashes) =>
      [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data:",
        "media-src 'self' blob:",
        "font-src 'self'",
        scriptPolicyFor(hashes),
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self'",
        "upgrade-insecure-requests",
      ].join("; ");
    const fallback = routeHashes["/_not-found"] || productionHashes;
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policyFor(fallback) },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...Object.entries(routeHashes).map(([source, hashes]) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: policyFor(hashes) }],
      })),
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};
