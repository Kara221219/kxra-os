import http from "node:http";
import { chromium } from "@playwright/test";
import lighthouse, { desktopConfig } from "lighthouse";

const origin = process.env.KXRA_MARKETING_ORIGIN;
if (!origin) throw Error("KXRA_MARKETING_ORIGIN is required");
const target = new URL(origin);
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(target.hostname)
)
  throw Error("Performance verification is restricted to loopback HTTP");
if (process.env.KXRA_EXPECT_PRODUCTION_CSP !== "true")
  throw Error(
    "Performance verification requires the optimized production server",
  );

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(Error("Unable to allocate a browser debugging port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForBrowser(port, browser) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (!browser.isConnected()) throw Error("Performance browser exited early");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Readiness is bounded by the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error("Performance browser readiness timed out");
}

function value(result, audit) {
  const numericValue = result.lhr.audits[audit]?.numericValue;
  if (!Number.isFinite(numericValue))
    throw Error(`Lighthouse did not produce ${audit}`);
  return numericValue;
}

function score(result, category) {
  const categoryScore = result.lhr.categories[category]?.score;
  if (!Number.isFinite(categoryScore))
    throw Error(`Lighthouse did not produce ${category}`);
  return categoryScore;
}

const budgets = {
  performance: 0.9,
  accessibility: 1,
  lcpMs: 2_500,
  cls: 0.1,
  tbtMs: 200,
};
const profiles = [
  { name: "mobile-home", path: "/", config: undefined },
  { name: "desktop-contact", path: "/contact", config: desktopConfig },
];
const port = await availablePort();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
  ],
});

try {
  await waitForBrowser(port, browser);
  for (const profile of profiles) {
    const result = await lighthouse(
      new URL(profile.path, target).href,
      {
        port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility"],
      },
      profile.config,
    );
    if (!result) throw Error(`Lighthouse returned no ${profile.name} result`);
    const metrics = {
      performance: score(result, "performance"),
      accessibility: score(result, "accessibility"),
      lcpMs: value(result, "largest-contentful-paint"),
      cls: value(result, "cumulative-layout-shift"),
      tbtMs: value(result, "total-blocking-time"),
    };
    const failures = [
      metrics.performance < budgets.performance &&
        `performance ${metrics.performance.toFixed(2)} < ${budgets.performance}`,
      metrics.accessibility < budgets.accessibility &&
        `accessibility ${metrics.accessibility.toFixed(2)} < ${budgets.accessibility}`,
      metrics.lcpMs > budgets.lcpMs &&
        `LCP ${metrics.lcpMs.toFixed(0)}ms > ${budgets.lcpMs}ms`,
      metrics.cls > budgets.cls &&
        `CLS ${metrics.cls.toFixed(3)} > ${budgets.cls}`,
      metrics.tbtMs > budgets.tbtMs &&
        `TBT ${metrics.tbtMs.toFixed(0)}ms > ${budgets.tbtMs}ms`,
    ].filter(Boolean);
    const accessibilityFindings =
      result.lhr.categories.accessibility?.auditRefs
        .filter((reference) => {
          const auditScore = result.lhr.audits[reference.id]?.score;
          return Number.isFinite(auditScore) && auditScore < 1;
        })
        .map((reference) => reference.id) || [];
    const accessibilityEvidence = accessibilityFindings.map((auditId) => {
      const items = result.lhr.audits[auditId]?.details?.items || [];
      const targets = items
        .flatMap((item) => item.node?.selector || item.node?.snippet || [])
        .slice(0, 5);
      return `${auditId}${targets.length ? ` (${targets.join(", ")})` : ""}`;
    });
    if (failures.length)
      throw Error(
        `${profile.name} budget failures: ${failures.join("; ")}; accessibility audits: ${accessibilityEvidence.join("; ") || "none"}`,
      );
    console.log(
      `${profile.name}: performance ${metrics.performance.toFixed(2)}, accessibility ${metrics.accessibility.toFixed(2)}, LCP ${metrics.lcpMs.toFixed(0)}ms, CLS ${metrics.cls.toFixed(3)}, TBT ${metrics.tbtMs.toFixed(0)}ms.`,
    );
  }
  console.log("Optimized marketing Lighthouse budgets PASS.");
} finally {
  await browser.close();
}
