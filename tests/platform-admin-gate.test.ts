import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, type Actor } from "../apps/os/lib/auth";
import { assertPlatformAdmin } from "../apps/os/lib/platform-admin";

const now = 1_700_000_000_000;

function actor(partial: Partial<Actor>): Actor {
  return partial as Actor;
}

test("platform admin requires the KXRA owner and a fresh MFA challenge", () => {
  assert.throws(
    () =>
      assertPlatformAdmin(
        actor({
          security_role: "ORG_ADMIN",
          organisation_kind: "CUSTOMER",
          aal: "aal2",
          auth_time: now / 1000,
        }),
        now,
      ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "NOT_FOUND",
  );
  assert.throws(
    () =>
      assertPlatformAdmin(
        actor({
          security_role: "KXRA_OWNER",
          organisation_kind: "KXRA",
          aal: "aal1",
          auth_time: now / 1000,
        }),
        now,
      ),
    (error: unknown) =>
      error instanceof HttpError && error.code === "RECENT_MFA_REQUIRED",
  );
  assert.doesNotThrow(() =>
    assertPlatformAdmin(
      actor({
        security_role: "KXRA_OWNER",
        organisation_kind: "KXRA",
        aal: "aal2",
        auth_time: now / 1000,
      }),
      now,
    ),
  );
});
