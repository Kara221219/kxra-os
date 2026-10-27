import fs from "node:fs";
import path from "node:path";
import { parse } from "parse5";

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

export function validateDeploymentId(id) {
  requireCondition(
    typeof id === "string" &&
      /^[A-Za-z0-9_-]{1,32}$/.test(id) &&
      !id.startsWith("dpl_"),
    "PREBUILT_INVALID_DEPLOYMENT_ID",
  );
  return id;
}

export function verifyPrebuiltSkew({
  applicationDirectory,
  outputDirectory,
  expectedId,
}) {
  validateDeploymentId(expectedId);
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
  const routes = read(
    path.join(applicationDirectory, ".next/routes-manifest.json"),
  );
  const required = read(
    path.join(applicationDirectory, ".next/required-server-files.json"),
  );
  const output = read(path.join(outputDirectory, "config.json"));
  requireCondition(
    routes.deploymentId === expectedId &&
      required.config?.deploymentId === expectedId &&
      output.version === 3 &&
      output.deploymentId === expectedId,
    "PREBUILT_DEPLOYMENT_ID_MISMATCH",
  );
  requireCondition(
    required.config?.experimental?.runtimeServerDeploymentId === false,
    "PREBUILT_RUNTIME_ID_OVERRIDE",
  );
  let nodeFunctions = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        requireCondition(
          fs
            .realpathSync(file)
            .startsWith(fs.realpathSync(outputDirectory) + path.sep),
          "PREBUILT_FUNCTION_SYMLINK_ESCAPE",
        );
        continue;
      }
      if (entry.isDirectory()) visit(file);
      else if (entry.name === ".vc-config.json") {
        const config = read(file);
        if (config.runtime === "edge") continue;
        requireCondition(
          config.runtime === "nodejs22.x" &&
            typeof config.handler === "string" &&
            !path.isAbsolute(config.handler) &&
            !config.handler.split(/[\\/]/).includes(".."),
          "PREBUILT_UNREVIEWED_HANDLER",
        );
        const launcher = fs.readFileSync(
          path.join(directory, config.handler),
          "utf8",
        );
        const match = launcher.match(/const conf = (\{[^\n]+\});\r?\n/);
        requireCondition(match, "PREBUILT_LAUNCHER_CONFIG_UNREADABLE");
        const configuration = JSON.parse(match[1]);
        requireCondition(
          configuration.deploymentId === expectedId,
          "PREBUILT_LAUNCHER_ID_MISMATCH",
        );
        requireCondition(
          configuration.experimental?.runtimeServerDeploymentId === false,
          "PREBUILT_RUNTIME_ID_OVERRIDE",
        );
        nodeFunctions += 1;
      }
    }
  }
  visit(path.join(outputDirectory, "functions"));
  requireCondition(nodeFunctions > 0, "PREBUILT_NODE_FUNCTIONS_MISSING");
  return { deploymentId: expectedId, nodeFunctions };
}

export function verifySkewHttpEvidence({ html, headers, expectedId }) {
  validateDeploymentId(expectedId);
  const document = parse(html);
  let htmlId;
  const staticAssets = [];
  function visit(node) {
    const attributes = Object.fromEntries(
      (node.attrs || []).map(({ name, value }) => [name, value]),
    );
    if (node.tagName === "html") htmlId = attributes["data-dpl-id"];
    for (const key of ["src", "href"]) {
      if (attributes[key]) {
        const url = new URL(attributes[key], "http://127.0.0.1");
        if (url.pathname.startsWith("/_next/static/")) staticAssets.push(url);
      }
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(document);
  requireCondition(
    htmlId === expectedId &&
      staticAssets.length > 0 &&
      staticAssets.every((url) => url.searchParams.get("dpl") === expectedId),
    "PREBUILT_RENDERED_ID_MISMATCH",
  );
  requireCondition(
    new Headers(headers).get("x-nextjs-deployment-id") === expectedId,
    "PREBUILT_NAVIGATION_ID_MISMATCH",
  );
  return { deploymentId: expectedId, staticAssets: staticAssets.length };
}
