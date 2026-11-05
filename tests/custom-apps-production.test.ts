import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  customAppsIdentityAllowed,
  productionCustomAppsEnabled,
  customAppsProviderSessionVersion,
} from "../packages/custom-apps/access";
test("Production app capability defaults closed and cannot admit fixture or fake-provider identities", () => {
  assert.equal(productionCustomAppsEnabled({}), false);
  for (const source of [undefined, "fixture", "fake-provider", "request"])
    assert.equal(
      customAppsIdentityAllowed(source, false, {
        KXRA_CUSTOM_APPS_ENABLED: "true",
      }),
      false,
    );
  assert.equal(
    customAppsIdentityAllowed("supabase", false, {
      KXRA_CUSTOM_APPS_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    customAppsIdentityAllowed("fixture", true, { VERCEL_ENV: "production" }),
    false,
  );
});
test("Custom app session authority only accepts verified top-level immutable provider claim", () => {
  for (const v of [undefined, null, "1", 0, -1, 1.5, 2147483648])
    assert.equal(
      customAppsProviderSessionVersion({ kxra_session_version: v }),
      undefined,
    );
  assert.equal(
    customAppsProviderSessionVersion({
      user_metadata: { kxra_session_version: 9 },
      app_metadata: { kxra_session_version: 9 },
      session_version: 9,
    }),
    undefined,
  );
  assert.equal(
    customAppsProviderSessionVersion({ kxra_session_version: 1 }),
    1,
  );
});
test("Production payload is offline, keeps fixture authority, and uses existing live-paid predicate", () => {
  const sql = fs.readFileSync("database/production/custom-apps-v1.sql", "utf8");
  assert.match(sql, /kxra_private.live_paid_entitled/);
  assert.match(sql, /provider_session_version/);
  assert.match(sql, /custom_app_review_current\(a_id,a.active_version\)/);
  assert.match(sql, /pg_advisory_xact_lock_shared/);
  assert.match(
    sql,
    /before insert or update or delete on kxra.team_room_members for each statement/,
  );
  assert.match(
    sql,
    /if not kxra_private.custom_apps_local\(\) or not kxra_private.manages_team_room/,
  );
  assert.doesNotMatch(
    sql,
    /insert into kxra_private.live_paid|alter role|create role|drop table/i,
  );
});

test("Production migration payload has an explicit exact offline inventory", async () => {
  const { customAppsProductionPayload } =
    await import("../scripts/custom-apps-production-payload.mjs");
  const { spec } = customAppsProductionPayload();
  assert.equal(spec.tables.length, 6);
  assert.equal(new Set(spec.functions).size, spec.functions.length);
  assert.equal(spec.authorityFenceTables.length, 27);
});

test("Actual custom-app server gate rejects a stale provider claim with a fresh database Actor version", async () => {
  const { requireCustomApps } = await import("../apps/os/lib/custom-apps");
  const previous = process.env.KXRA_CUSTOM_APPS_ENABLED;
  const previousMode = process.env.KXRA_AUTH_MODE;
  process.env.KXRA_AUTH_MODE = "supabase";
  process.env.KXRA_CUSTOM_APPS_ENABLED = "true";
  try {
    const actor = {
      source: "supabase",
      session_version: 2,
      provider_session_version: 1,
    } as import("../apps/os/lib/auth").Actor;
    assert.throws(() => requireCustomApps(actor), { status: 404 });
    assert.doesNotThrow(() =>
      requireCustomApps({ ...actor, provider_session_version: 2 }),
    );
    assert.throws(
      () =>
        requireCustomApps({ ...actor, provider_session_version: undefined }),
      { status: 404 },
    );
  } finally {
    if (previousMode === undefined) delete process.env.KXRA_AUTH_MODE;
    else process.env.KXRA_AUTH_MODE = previousMode;
    if (previous === undefined) delete process.env.KXRA_CUSTOM_APPS_ENABLED;
    else process.env.KXRA_CUSTOM_APPS_ENABLED = previous;
  }
});
