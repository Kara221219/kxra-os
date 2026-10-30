import { localModeConfiguration } from "#kxra/local-guard";
/** Read-only server capability report. Presence of a key is never acceptance. */
export function workspaceExecutionReadiness(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const fixture =
    localModeConfiguration(environment) && !environment.VERCEL_ENV;
  return {
    fixture_draft_worker: {
      available: fixture,
      activated: false,
      scope: "EXPLICIT_AUTHENTICATED_LOCAL_DRAIN",
    },
    hosted_draft_worker: {
      available: false,
      activated: false,
      blockers: [
        "SCOPED_GRANT_MIGRATION_AND_CONFIGURATION_APPROVAL_PENDING",
        "HOSTED_WAKEUP_AND_LEASE_ACCEPTANCE_PENDING",
        "PROVIDER_BUDGET_AND_REVOCATION_ACCEPTANCE_PENDING",
      ],
    },
    hosted_recurring: {
      available: false,
      activated: false,
      blockers: ["HOSTED_SCHEDULER_AND_MONITORING_ACCEPTANCE_PENDING"],
    },
    provider_acceptance: { accepted: false, scope: "PROTOCOL_FIXTURES_ONLY" },
  } as const;
}
