export function ciPhaseConfiguration(args) {
  const focusedTeam = args.includes("--team-workspace");
  const servicesOnly = args.includes("--services-only");
  if (focusedTeam && servicesOnly) throw Error("CI_PHASE_CONFLICT");
  return Object.freeze({
    focusedTeam,
    servicesOnly,
    needsServicePhase: !focusedTeam && !servicesOnly,
    diagnosticsAllowed: !focusedTeam && !servicesOnly,
    runtimeDirectory: focusedTeam
      ? "team-ci"
      : servicesOnly
        ? "ci-services"
        : "ci",
  });
}

// Service-created AT-08/10 evidence stays in its own retained runtime. Browser
// tests use a newly seeded runtime and the same unmodified application quotas.
export const serviceVerificationCommands = Object.freeze([
  Object.freeze(["test:dependencies"]),
  Object.freeze(["test"]),
  Object.freeze(["test:migrations"]),
  Object.freeze(["test:restart"]),
  Object.freeze(["test:restore"]),
]);
