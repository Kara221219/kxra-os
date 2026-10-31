export const roomVerificationPhases = Object.freeze([
  Object.freeze({
    flag: "--room-delivery-only",
    directory: "ci-room-delivery",
    files: Object.freeze([
      "tests/operations/hosted-room-boundary.test.ts",
      "tests/operations/hosted-room-operations.test.ts",
    ]),
  }),
  Object.freeze({
    flag: "--room-maintenance-only",
    directory: "ci-room-maintenance",
    files: Object.freeze([
      "tests/operations/room-maintenance-boundary.test.ts",
      "tests/operations/room-maintenance.test.ts",
    ]),
  }),
]);
export function ciPhaseConfiguration(args) {
  const allowed = [
    "--team-workspace",
    "--services-only",
    ...roomVerificationPhases.map((p) => p.flag),
  ];
  if (args.some((arg) => !allowed.includes(arg)))
    throw Error("CI_PHASE_UNKNOWN");
  if (args.length > 1) throw Error("CI_PHASE_CONFLICT");
  const focusedTeam = args.includes("--team-workspace");
  const servicesOnly = args.includes("--services-only");
  const operations =
    roomVerificationPhases.find((p) => args.includes(p.flag)) ?? null;
  return Object.freeze({
    focusedTeam,
    servicesOnly,
    operations,
    needsServicePhase: !focusedTeam && !servicesOnly && !operations,
    diagnosticsAllowed: !focusedTeam && !servicesOnly && !operations,
    runtimeDirectory: operations
      ? operations.directory
      : focusedTeam
        ? "team-ci"
        : servicesOnly
          ? "ci-services"
          : "ci",
  });
}

// Original service AT-08/10 and browser-created recovery datasets remain separate.
// Operations use fresh serial fixtures so their additional runs cannot consume
// the original suite identity's unmodified daily run quota.
export const serviceVerificationCommands = Object.freeze([
  Object.freeze(["test:dependencies"]),
  Object.freeze(["test"]),
  Object.freeze(["test:migrations"]),
  Object.freeze(["test:restart"]),
  Object.freeze(["test:restore"]),
]);

// Parent starts another fixture only after the preceding child exits cleanly.
export function runPrerequisitePhases(execute) {
  for (const flag of [
    "--services-only",
    ...roomVerificationPhases.map((p) => p.flag),
  ]) {
    const status = execute(flag);
    if (status !== 0) throw Error(`CI_PREREQUISITE_FAILED:${flag}:${status}`);
  }
}
export function disposablePostgresCleanupPassed(stopStatus, probeStatus) {
  return stopStatus === 0 && probeStatus === 3;
}
