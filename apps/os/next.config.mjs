import path from "node:path";
export default {
  distDir:
    process.env.KXRA_NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  outputFileTracingRoot: path.resolve("../.."),
  poweredByHeader: false,
  // Prebuilt artifacts carry their reviewed custom deployment ID. Do not depend
  // on a second runtime environment value to reconstruct that identity.
  experimental: {
    runtimeServerDeploymentId: false,
    // Keep the new development MCP server/file logger disabled. CI retains
    // bounded diagnostics rather than raw request/browser logs.
    mcpServer: false,
  },
  webpack(config, { dev, isServer }) {
    if (!dev && !isServer) config.optimization.moduleIds = "size";
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/os/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};
