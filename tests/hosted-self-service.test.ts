import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
function configuration() {
  assert.ok(
    localModeConfiguration(process.env),
    "Hosted admission tests use isolated synthetic PostgreSQL only",
  );
  const value = JSON.parse(
    fs.readFileSync(
      path.join(process.env.KXRA_RUNTIME!, "database.json"),
      "utf8",
    ),
  );
  assert.equal(value.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(value.user, "kxra_app");
  return { ...value, password: "" };
}
async function admin(sql: string, values: unknown[] = []) {
  const db = new pg.Client({
    ...configuration(),
    user: os.userInfo().username,
  });
  await db.connect();
  try {
    return await db.query(sql, values);
  } finally {
    await db.end();
  }
}
type Identity = {
  uid?: string;
  email?: string;
  verified?: boolean;
  hosted?: boolean;
  trusted?: boolean;
  org?: string;
};
async function app(identity: Identity, sql: string, values: unknown[] = []) {
  const db = new pg.Client(configuration());
  await db.connect();
  try {
    await db.query("begin");
    await db.query(
      "set local role " + (identity.uid ? "authenticated" : "anon"),
    );
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.hosted_self_service',$4,true),set_config('request.kxra.verified_supabase_identity',$5,true)",
      [
        identity.uid || "",
        JSON.stringify({
          sub: identity.uid,
          email: identity.email,
          email_verified: identity.verified || false,
          aal: "aal1",
        }),
        identity.org || "",
        identity.hosted === false ? "off" : "on",
        identity.trusted === false ? "off" : "on",
      ],
    );
    const value = await db.query(sql, values);
    await db.query("commit");
    return value;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}
async function enabled(work: () => Promise<void>) {
  await admin(
    "update kxra.hosted_self_service_config set enabled=true,revision=revision+1,auth_settings_review='Synthetic fixture review: confirm-email required'",
  );
  try {
    await work();
  } finally {
    await admin(
      "update kxra.hosted_self_service_config set enabled=false,revision=revision+1,auth_settings_review=null",
    );
  }
}
async function admission(
  email = `synthetic-${crypto.randomUUID()}@example.test`,
) {
  const proof = crypto.randomBytes(32).toString("base64url"),
    id = crypto.randomUUID(),
    uid = crypto.randomUUID();
  await app({}, "select kxra_private.prepare_hosted_signup($1,$2,$3)", [
    hash(email),
    hash(proof),
    id,
  ]);
  return { email, proof, id, uid };
}
type Admission = Awaited<ReturnType<typeof admission>>;
async function hook(
  value: Admission,
  overrides: Record<string, unknown> = {},
  wrapper = true,
) {
  const db = new pg.Client({
    ...configuration(),
    user: os.userInfo().username,
  });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("set local role supabase_auth_admin");
    const event = {
      metadata: { uuid: crypto.randomUUID() },
      user: {
        id: value.uid,
        email: value.email,
        is_anonymous: false,
        app_metadata: { provider: "email" },
        user_metadata: { kxra_self_service_challenge: value.proof },
        ...overrides,
      },
    };
    const result = (
      await db.query(
        `select kxra_private.${wrapper ? "before_user_created_with_self_service" : "before_user_created"}($1) result`,
        [event],
      )
    ).rows[0].result;
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}
function identity(value: Admission): Identity {
  return { uid: value.uid, email: value.email, verified: true };
}
async function provision(
  value: Admission,
  request: string = crypto.randomUUID(),
  name = "Synthetic hosted workspace",
) {
  return (
    await app(
      identity(value),
      "select kxra_private.provision_hosted_self_service($1,$2) receipt",
      [request, name],
    )
  ).rows[0].receipt as {
    organisation_id: string;
    project_id: string;
    request_id: string;
  };
}

test("hosted admission remains disabled by default and private metadata cannot be read or enabled by callers", async () => {
  assert.equal(
    (await admin("select enabled from kxra.hosted_self_service_config")).rows[0]
      .enabled,
    false,
  );
  await assert.rejects(admission(), { code: "42501" });
  for (const actor of [{}, { uid: crypto.randomUUID(), verified: true }]) {
    for (const table of [
      "hosted_self_service_config",
      "hosted_signup_admissions",
    ])
      await assert.rejects(app(actor, `select * from kxra.${table}`), {
        code: "42501",
      });
    await assert.rejects(
      app(actor, "update kxra.hosted_self_service_config set enabled=true"),
      { code: "42501" },
    );
    await assert.rejects(
      app(
        actor,
        "select kxra_private.before_user_created_with_self_service('{}')",
      ),
      { code: "42501" },
    );
  }
  await assert.rejects(
    admin(
      "update kxra.hosted_self_service_config set enabled=true,auth_settings_review=null",
    ),
    { code: "23514" },
  );
});

test("opaque admission requires trusted server context and exact Auth hook proof/provider/identity", async () =>
  enabled(async () => {
    await assert.rejects(
      app(
        { hosted: false },
        "select kxra_private.prepare_hosted_signup($1,$2,$3)",
        [
          hash("synthetic@example.test"),
          hash("synthetic proof"),
          crypto.randomUUID(),
        ],
      ),
      { code: "42501" },
    );
    const value = await admission();
    for (const bad of [
      { user_metadata: { kxra_self_service_challenge: "x".repeat(43) } },
      { email: "another@example.test" },
      { id: "not-a-uuid" },
      { is_anonymous: true },
      { app_metadata: { provider: "anonymous" } },
    ])
      assert.equal((await hook(value, bad)).error.http_code, 403);
    assert.deepEqual(await hook(value), {});
    assert.deepEqual(await hook(value), {}); // Same provider event identity: idempotent consumption.
    assert.equal(
      (await hook({ ...value, uid: crypto.randomUUID() })).error.http_code,
      403,
    );
    assert.equal(
      (
        await admin(
          "select count(*)::int n from kxra.hosted_signup_admissions where id=$1 and auth_user_id=$2 and consumed_at is not null",
          [value.id, value.uid],
        )
      ).rows[0].n,
      1,
    );
  }));

test("expiry, replacement, operator revision and revocation prevent unused admission", async () =>
  enabled(async () => {
    const expired = await admission();
    await admin(
      "update kxra.hosted_signup_admissions set created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' where id=$1",
      [expired.id],
    );
    assert.equal((await hook(expired)).error.http_code, 403);
    const first = await admission(),
      second = await admission(first.email);
    assert.equal((await hook(first)).error.http_code, 403);
    assert.deepEqual(await hook(second), {});
    await admin(
      "update kxra.hosted_signup_admissions set revoked_at=now() where id=$1",
      [second.id],
    );
    await assert.rejects(provision(second), { code: "42501" });
    const drifted = await admission();
    await admin(
      "update kxra.hosted_self_service_config set revision=revision+1",
    );
    assert.equal((await hook(drifted)).error.http_code, 403);
  }));

test("unverified, wrong-source, wrong-email and unadmitted identities cannot provision; paid access stays absent", async () =>
  enabled(async () => {
    const value = await admission();
    await assert.rejects(provision(value), { code: "42501" });
    assert.deepEqual(await hook(value), {});
    for (const actor of [
      { ...identity(value), verified: false },
      { ...identity(value), trusted: false },
      { ...identity(value), hosted: false },
      { ...identity(value), email: "mismatch@example.test" },
      { ...identity(value), uid: crypto.randomUUID() },
      {},
    ])
      await assert.rejects(
        app(actor, "select kxra_private.provision_hosted_self_service($1,$2)", [
          crypto.randomUUID(),
          "Synthetic rejected workspace",
        ]),
        { code: "42501" },
      );
    assert.equal(
      (
        await app(
          identity(value),
          "select kxra_private.hosted_self_service_identity_pending() pending",
        )
      ).rows[0].pending,
      true,
    );
    const receipt = await provision(value);
    assert.equal(
      (
        await app(
          identity(value),
          "select kxra_private.hosted_self_service_identity_pending() pending",
        )
      ).rows[0].pending,
      false,
    );
    const state = (
      await admin(
        "select a.auth_provider,a.state,m.security_role,m.relationship_type,s.auth_provider provenance,kxra_private.pilot_entitled(s.org_id) entitled from kxra.self_service_workspaces s join kxra.account_identities a on a.account_id=s.account_id join kxra.organisation_memberships m on m.account_id=s.account_id and m.org_id=s.org_id where s.account_id=$1",
        [value.uid],
      )
    ).rows[0];
    assert.deepEqual(state, {
      auth_provider: "SUPABASE",
      state: "ONBOARDING",
      security_role: "ORG_ADMIN",
      relationship_type: "CUSTOMER",
      provenance: "SUPABASE",
      entitled: false,
    });
    await assert.rejects(
      app(
        { ...identity(value), org: receipt.organisation_id },
        "select kxra.team_room_create($1,'Synthetic unpaid denial','','PRIVATE')",
        [receipt.project_id],
      ),
    );
  }));

test("concurrent provisioning and session recovery return one receipt without changing tenant or granting internal roles", async () =>
  enabled(async () => {
    const value = await admission();
    assert.deepEqual(await hook(value), {});
    const request = crypto.randomUUID(),
      competingRequest = crypto.randomUUID();
    const receipts = await Promise.all([
      provision(value, request),
      provision(value, request),
      provision(value, competingRequest),
    ]);
    assert.deepEqual(receipts[0], receipts[1]);
    assert.deepEqual(receipts[0], receipts[2]);
    assert.ok(
      receipts[0].request_id === request ||
        receipts[0].request_id === competingRequest,
    );
    await assert.rejects(
      provision(value, crypto.randomUUID(), "Different workspace"),
      { code: "P0001" },
    );
    const other = await admission();
    assert.deepEqual(await hook(other), {});
    // The winner is deliberately nondeterministic; only its canonical request
    // is reserved. Reusing that actual receipt must fail for another tenant.
    await assert.rejects(provision(other, receipts[0].request_id), {
      code: "42501",
    });
    const second = await provision(other);
    assert.notEqual(second.organisation_id, receipts[0].organisation_id);
    for (const [subject, own] of [
      [value, receipts[0]],
      [other, second],
    ] as const) {
      const rows = (
        await app(
          { ...identity(subject), org: own.organisation_id },
          "select org_id,auth_provider from kxra.self_service_workspaces where account_id=any($1::uuid[])",
          [[value.uid, other.uid]],
        )
      ).rows;
      assert.deepEqual(rows, [
        { org_id: own.organisation_id, auth_provider: "SUPABASE" },
      ]);
      const forged = await app(
        {
          ...identity(subject),
          org:
            own.organisation_id === second.organisation_id
              ? receipts[0].organisation_id
              : second.organisation_id,
        },
        "select org_id from kxra.self_service_workspaces where account_id=any($1::uuid[])",
        [[value.uid, other.uid]],
      );
      assert.deepEqual(forged.rows, []);
      assert.equal(
        (
          await admin(
            "select count(*)::int n from kxra.organisation_memberships where account_id=$1",
            [subject.uid],
          )
        ).rows[0].n,
        1,
      );
    }
  }));

test("new wrapper does not admit an uninvited old challenge or alter the existing invitation hook", async () => {
  const value = {
    email: "synthetic-invite@example.test",
    proof: "x".repeat(43),
    id: crypto.randomUUID(),
    uid: crypto.randomUUID(),
  };
  const input = { user_metadata: { kxra_signup_challenge: value.proof } };
  assert.deepEqual(await hook(value, input), await hook(value, input, false));
  assert.equal((await hook(value, input)).error.http_code, 403);
});

async function status(value: Admission, overrides: Identity = {}) {
  return (
    await app(
      { ...identity(value), ...overrides },
      "select kxra_private.hosted_self_service_status() status",
    )
  ).rows[0].status;
}

test("verified admission recovery exposes only own status and never renews revoked or revised authority", async () =>
  enabled(async () => {
    const value = await admission();
    assert.deepEqual(await status(value), { state: "REVIEW_REQUIRED" });
    assert.deepEqual(await hook(value), {});
    assert.deepEqual(await status(value), { state: "READY" });
    for (const actor of [
      { verified: false },
      { trusted: false },
      { hosted: false },
    ])
      assert.deepEqual(await status(value, actor), { state: "UNAVAILABLE" });
    await admin(
      "update kxra.hosted_self_service_config set revision=revision+1",
    );
    assert.deepEqual(await status(value), { state: "REVIEW_REQUIRED" });
    await assert.rejects(provision(value), { code: "42501" });
    const revoked = await admission();
    await hook(revoked);
    await admin(
      "update kxra.hosted_signup_admissions set revoked_at=now() where id=$1",
      [revoked.id],
    );
    assert.deepEqual(await status(revoked), { state: "REVIEW_REQUIRED" });
    await assert.rejects(provision(revoked), { code: "42501" });
    const existing = await admission();
    await hook(existing);
    await provision(
      existing,
      crypto.randomUUID(),
      "Canonical synthetic workspace",
    );
    assert.deepEqual(await status(existing), {
      state: "EXISTING",
      workspace_name: "Canonical synthetic workspace",
    });
    const another = await admission();
    await hook(another);
    assert.deepEqual(await status(another), { state: "READY" });
    assert.deepEqual(await status(another, { uid: crypto.randomUUID() }), {
      state: "REVIEW_REQUIRED",
    });
    await admin(
      "update kxra.organisation_memberships set revoked_at=now(),state='REVOKED' where account_id=$1",
      [existing.uid],
    );
    assert.deepEqual(await status(existing), { state: "REVIEW_REQUIRED" });
    assert.equal(
      (
        await admin(
          "select count(*)::int n from kxra.self_service_workspaces where account_id=any($1::uuid[])",
          [[value.uid, revoked.uid]],
        )
      ).rows[0].n,
      0,
    );
  }));

test("invitation wrapper preserves valid single-use and expired invitation behavior with self-service on or off", async () => {
  const org = "10000000-0000-4000-8000-000000000001",
    project = "30000000-0000-4000-8000-000000000002",
    owner = "20000000-0000-4000-8000-000000000001";
  async function journey() {
    const value = {
      email: `synthetic-invited-${crypto.randomUUID()}@example.test`,
      proof: crypto.randomBytes(32).toString("base64url"),
      id: crypto.randomUUID(),
      uid: crypto.randomUUID(),
    };
    const token = hash(crypto.randomBytes(32).toString("hex"));
    await admin(
      "insert into kxra.invitations(id,org_id,project_id,email_digest,token_digest,role,state,approved_by,recipient_email,expires_at) values($1,$2,$3,$4,$5,'viewer','SENT',$6,$7,now()+interval '1 hour')",
      [value.id, org, project, hash(value.email), token, owner, value.email],
    );
    await app({}, "select kxra_private.prepare_invited_signup($1,$2)", [
      token,
      hash(value.proof),
    ]);
    const invited = { user_metadata: { kxra_signup_challenge: value.proof } };
    assert.deepEqual(await hook(value, invited), {});
    assert.equal((await hook(value, invited)).error.http_code, 403);
    const next = crypto.randomBytes(32).toString("base64url");
    await app({}, "select kxra_private.prepare_invited_signup($1,$2)", [
      token,
      hash(next),
    ]);
    await admin(
      "update kxra.auth_signup_challenges set created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' where invitation_id=$1 and consumed_at is null",
      [value.id],
    );
    assert.equal(
      (await hook(value, { user_metadata: { kxra_signup_challenge: next } }))
        .error.http_code,
      403,
    );
  }
  await journey();
  await enabled(journey);
});
