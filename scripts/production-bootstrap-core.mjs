import {
  validateProductionTarget,
  productionProjectRef,
} from "./production-migrations-core.mjs";

export const productionBootstrapProfile = "KXRA-PRODUCTION-BOOTSTRAP-V1";

export const productionBootstrapRoles = Object.freeze([
  "kxra_app",
  "kxra_public_ingress",
  "kxra_email_runner",
  "kxra_billing_runner",
]);

function validPassword(value) {
  return /^[A-Za-z0-9_-]{48,128}$/.test(value || "");
}

export function productionBootstrapPasswords(environment) {
  return {
    app: environment.KXRA_PRODUCTION_APP_PASSWORD || "",
    publicIngress: environment.KXRA_PRODUCTION_PUBLIC_INGRESS_PASSWORD || "",
    emailWorker: environment.KXRA_PRODUCTION_EMAIL_WORKER_PASSWORD || "",
    billingWorker: environment.KXRA_PRODUCTION_BILLING_WORKER_PASSWORD || "",
  };
}

export function validateProductionBootstrap(environment, command) {
  const findings = validateProductionTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");

  if (command === "apply") {
    const passwords = productionBootstrapPasswords(environment);
    for (const [name, value] of Object.entries(passwords))
      if (!validPassword(value))
        findings.push(
          `KXRA_PRODUCTION_${name
            .replace(/[A-Z]/g, (letter) => `_${letter}`)
            .toUpperCase()}_PASSWORD must be 48-128 base64url characters`,
        );
    if (
      new Set(Object.values(passwords)).size !== Object.keys(passwords).length
    )
      findings.push("production runtime passwords must all be different");

    const expected = `BOOTSTRAP:${productionProjectRef}:${environment.KXRA_PRODUCTION_SOURCE_COMMIT || ""}`;
    if (environment.KXRA_PRODUCTION_BOOTSTRAP_CONFIRMATION !== expected)
      findings.push(
        `KXRA_PRODUCTION_BOOTSTRAP_CONFIRMATION must equal ${expected}`,
      );
  }

  return { ok: findings.length === 0, findings };
}

export function productionBootstrapFindings(state) {
  const findings = [];
  if (!state.migrationsComplete) findings.push("migrations are incomplete");
  if (!state.seedApplied) findings.push("canonical seed is missing");
  findings.push(...state.runtimeRoleFindings);
  findings.push(...state.emailRoleFindings);
  findings.push(...state.billingRoleFindings);
  findings.push(...state.legalFindings);
  if (!state.event) findings.push("production bootstrap evidence is missing");
  else if (
    state.event.profile !== productionBootstrapProfile ||
    state.event.source_commit !== state.sourceCommit
  )
    findings.push("production bootstrap evidence differs from source commit");
  return findings;
}
