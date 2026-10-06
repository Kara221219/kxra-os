import {
  productionProjectRef,
  validateProductionTarget,
} from "./production-migrations-core.mjs";

export const productionOwnerProfile = "KXRA-PRODUCTION-OWNER-V1";
export const productionOwnerGrantSource = "PRODUCTION_OWNER_BOOTSTRAP";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeProductionOwnerInput(environment) {
  return {
    userId: (environment.KXRA_PRODUCTION_OWNER_USER_ID || "").toLowerCase(),
    email: (environment.KXRA_PRODUCTION_OWNER_EMAIL || "").trim().toLowerCase(),
    displayName: (environment.KXRA_PRODUCTION_OWNER_DISPLAY_NAME || "").trim(),
  };
}

export function validateProductionOwnerOperator(environment, command) {
  const findings = validateProductionTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const input = normalizeProductionOwnerInput(environment);
  if (!uuid.test(input.userId))
    findings.push("KXRA_PRODUCTION_OWNER_USER_ID must be a UUID");
  if (!emailPattern.test(input.email) || input.email.length > 320)
    findings.push("KXRA_PRODUCTION_OWNER_EMAIL must be a normalized email");
  if (input.displayName.length < 1 || input.displayName.length > 120)
    findings.push(
      "KXRA_PRODUCTION_OWNER_DISPLAY_NAME must be 1-120 characters",
    );
  if (command === "apply") {
    const expected = `OWNER:${productionProjectRef}:${input.userId}:${environment.KXRA_PRODUCTION_SOURCE_COMMIT || ""}`;
    if (environment.KXRA_PRODUCTION_OWNER_CONFIRMATION !== expected)
      findings.push(
        `KXRA_PRODUCTION_OWNER_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings, input };
}
