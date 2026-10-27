import os from "node:os";
import path from "node:path";

/** @param {string} runtime @param {string} name @param {Record<string, string | undefined>} [environment] */
export function ciLogDestination(runtime, name, environment = process.env) {
  if (!/^[a-z][a-z0-9-]*\.log$/.test(name)) throw Error("CI_LOG_NAME_REJECTED");
  return environment.KXRA_CI_BOUNDED_OUTPUT === "true"
    ? os.devNull
    : path.join(runtime, name);
}

/** @param {Record<string, string | undefined>} [environment]
 * @returns {{ trace: "off" | "retain-on-failure", screenshot: "off" | "only-on-failure" }} */
export function ciBrowserArtifacts(environment = process.env) {
  return environment.KXRA_CI_BOUNDED_OUTPUT === "true"
    ? { trace: "off", screenshot: "off" }
    : { trace: "retain-on-failure", screenshot: "only-on-failure" };
}

/** @param {Record<string, string | undefined>} [environment]
 * @returns {"never" | "always"} */
export function ciPreserveOutput(environment = process.env) {
  return environment.KXRA_CI_BOUNDED_OUTPUT === "true" ? "never" : "always";
}

/** @param {string} requested @param {Record<string, string | undefined>} [environment] */
export function ciScreenshotPath(requested, environment = process.env) {
  return environment.KXRA_CI_BOUNDED_OUTPUT === "true" ? undefined : requested;
}
