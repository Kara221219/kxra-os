import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import {
  openEmailDeliverySecret,
  ResendEmailTransport,
  sealEmailDeliverySecret,
  verifyResendWebhook,
} from "../packages/integrations/email";
import { processNextTransactionalEmail } from "../packages/integrations/email-worker";
import { POST as resendWebhook } from "../apps/email-worker/app/api/webhooks/resend/route";
import { runtimeFile } from "./support/runtime";

const root = process.cwd();
process.env.KXRA_AUTH_MODE ||= "fixture";
process.env.KXRA_RUNTIME ||= path.join(root, ".runtime");
process.env.KXRA_ORIGIN ||= "http://127.0.0.1:3210";
process.env.KXRA_EMAIL_ENABLED = "true";
const encryptionKey = crypto.randomBytes(32).toString("base64url");
process.env.KXRA_EMAIL_SECRET_KEY = encryptionKey;
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
process.env.KXRA_EMAIL_WORKER_DATABASE_URL = `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:${config.port}/${config.database}?host=${encodeURIComponent(config.host)}`;
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";

after(() => admin.end());

async function transaction<T>(
  role: "authenticated" | "kxra_email_worker",
  work: (database: pg.PoolClient) => Promise<T>,
) {
  const database = await admin.connect();
  try {
    await database.query("begin");
    await database.query(`set local role ${role}`);
    if (role === "authenticated")
      await database.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          owner,
          JSON.stringify({
            sub: owner,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          org,
        ],
      );
    const result = await work(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function queuedInvitation() {
  await admin.query(
    `update kxra.transactional_email_outbox set state='CANCELLED',
      lease_expires_at=null,worker_reference=null,updated_at=now()
     where state in ('PENDING','DELIVERY_FAILED','RUNNING')`,
  );
  const token = crypto.randomBytes(32).toString("base64url");
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const request = await transaction("authenticated", async (database) => {
    const created = (
      await database.query<{
        id: string;
        outbox_id: string;
      }>(
        "select * from kxra.create_multi_project_invitation($1,$2,$3,$4,now()+interval '1 hour')",
        [
          `email-${crypto.randomUUID()}@example.test`,
          JSON.stringify([{ project_id: p2, role: "viewer" }]),
          "Synthetic email-worker acceptance",
          digest,
        ],
      )
    ).rows[0];
    const sealed = sealEmailDeliverySecret(token, digest, encryptionKey);
    await database.query(
      "select kxra.attach_transactional_email_secret($1,$2,$3,$4,$5)",
      [
        created.outbox_id,
        sealed.ciphertext,
        sealed.nonce,
        sealed.authTag,
        digest,
      ],
    );
    return { ...created, token };
  });
  return request;
}

test("email delivery secrets are authenticated, digest-bound and key-bound", () => {
  const token = crypto.randomBytes(32).toString("base64url");
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  const sealed = sealEmailDeliverySecret(token, digest, encryptionKey);
  assert.equal(openEmailDeliverySecret(sealed, encryptionKey), token);
  assert.throws(
    () =>
      openEmailDeliverySecret(
        sealed,
        crypto.randomBytes(32).toString("base64url"),
      ),
    /EMAIL_SECRET_DECRYPTION_FAILED/,
  );
  assert.throws(
    () => sealEmailDeliverySecret(`${token}x`, digest, encryptionKey),
    /EMAIL_SECRET_DIGEST_MISMATCH/,
  );
});

test("email worker role is non-login, non-bypass and owns only bounded functions", async () => {
  const role = (
    await admin.query(
      "select rolcanlogin,rolsuper,rolbypassrls,rolinherit from pg_roles where rolname='kxra_email_worker'",
    )
  ).rows[0];
  assert.deepEqual(role, {
    rolcanlogin: false,
    rolsuper: false,
    rolbypassrls: false,
    rolinherit: false,
  });
  assert.equal(
    (
      await admin.query(
        `select has_function_privilege('authenticated',
          'kxra_private.claim_transactional_email(text)','execute') allowed`,
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await admin.query(
        `select has_function_privilege('kxra_email_worker',
          'kxra_private.claim_transactional_email(text)','execute') allowed`,
      )
    ).rows[0].allowed,
    true,
  );
});

test("Resend transport sends an exact idempotent request and classifies outcomes", async () => {
  let captured: RequestInit | undefined;
  const transport = new ResendEmailTransport({
    apiKey: "re_fixture_key_123456",
    from: "KXRA Group <notifications@example.test>",
    fetch: async (_url, init) => {
      captured = init;
      return Response.json({ id: "provider-message-1" });
    },
  });
  const result = await transport.deliver({
    operationKey: "invitation/test/v1",
    recipient: "person@example.test",
    rendered: {
      template: "PARTNER_INVITATION",
      version: 1,
      subject: "Subject",
      preheader: "Preview",
      text: "Text",
      html: "<p>Text</p>",
    },
  });
  assert.deepEqual(result, {
    outcome: "ACCEPTED",
    providerMessageId: "provider-message-1",
  });
  assert.equal(
    (captured?.headers as Record<string, string>)["idempotency-key"],
    "invitation/test/v1",
  );
  assert.equal(JSON.parse(String(captured?.body)).to[0], "person@example.test");

  const throttled = new ResendEmailTransport({
    apiKey: "re_fixture_key_123456",
    from: "KXRA Group <notifications@example.test>",
    fetch: async () =>
      Response.json(
        { name: "rate_limit_exceeded" },
        { status: 429, headers: { "retry-after": "17" } },
      ),
  });
  assert.deepEqual(
    await throttled.deliver({
      operationKey: "retry/test/v1",
      recipient: "person@example.test",
      rendered: {
        template: "SECURITY_ALERT",
        version: 1,
        subject: "Subject",
        preheader: "Preview",
        text: "Text",
        html: "<p>Text</p>",
      },
    }),
    {
      outcome: "RETRY",
      errorCode: "RESEND_RATE_LIMIT_EXCEEDED",
      retryAfterSeconds: 17,
    },
  );
  const uncertain = new ResendEmailTransport({
    apiKey: "re_fixture_key_123456",
    from: "KXRA Group <notifications@example.test>",
    fetch: async () => {
      throw new Error("connection reset");
    },
  });
  assert.deepEqual(
    await uncertain.deliver({
      operationKey: "uncertain/test/v1",
      recipient: "person@example.test",
      rendered: {
        template: "SECURITY_ALERT",
        version: 1,
        subject: "Subject",
        preheader: "Preview",
        text: "Text",
        html: "<p>Text</p>",
      },
    }),
    { outcome: "AMBIGUOUS", errorCode: "RESEND_TRANSPORT_UNKNOWN" },
  );
});

test("Resend webhook verification binds raw bytes, timestamp and event id", () => {
  const secretBytes = crypto.randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const id = "msg_fixture_webhook";
  const timestamp = "1790463600";
  const payload = '{"type":"email.delivered"}';
  const signature = crypto
    .createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  assert.doesNotThrow(() =>
    verifyResendWebhook({
      payload,
      id,
      timestamp,
      signature: `v1,${signature}`,
      secret,
      nowSeconds: Number(timestamp),
    }),
  );
  assert.throws(
    () =>
      verifyResendWebhook({
        payload: `${payload} `,
        id,
        timestamp,
        signature: `v1,${signature}`,
        secret,
        nowSeconds: Number(timestamp),
      }),
    /RESEND_WEBHOOK_SIGNATURE_INVALID/,
  );
});

test("email worker decrypts once, reauthorizes and records provider acceptance", async () => {
  const invitation = await queuedInvitation();
  const providerMessageId = `fixture-provider-${crypto.randomUUID()}`;
  let deliveredLink = "";
  const result = await processNextTransactionalEmail({
    workerReference: `fixture-email-${crypto.randomUUID()}`,
    databaseConfiguration: { ...config, user: os.userInfo().username },
    transport: {
      deliver: async (input) => {
        deliveredLink = input.rendered.text;
        return { outcome: "ACCEPTED", providerMessageId };
      },
    },
  });
  assert.equal(result?.outboxId, invitation.outbox_id);
  assert.equal(result?.state, "SENT");
  assert.match(deliveredLink, new RegExp(encodeURIComponent(invitation.token)));
  const state = (
    await admin.query(
      `select outbox.state,outbox.provider_message_id,secret.consumed_at,invite.state invitation_state
       from kxra.transactional_email_outbox outbox
       join kxra.transactional_email_delivery_secrets secret on secret.outbox_id=outbox.id
       join kxra.invitations invite on invite.id=outbox.invitation_id where outbox.id=$1`,
      [invitation.outbox_id],
    )
  ).rows[0];
  assert.equal(state.state, "SENT");
  assert.equal(state.invitation_state, "SENT");
  assert.equal(state.provider_message_id, providerMessageId);
  assert.ok(state.consumed_at);

  const eventId = `event-${crypto.randomUUID()}`;
  const occurredAt = new Date().toISOString();
  const webhookSecretBytes = crypto.randomBytes(24);
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${webhookSecretBytes.toString("base64")}`;
  process.env.KXRA_EMAIL_ENABLED = "true";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({
    type: "email.delivered",
    created_at: occurredAt,
    data: { email_id: providerMessageId },
  });
  const signature = crypto
    .createHmac("sha256", webhookSecretBytes)
    .update(`${eventId}.${timestamp}.${payload}`)
    .digest("base64");
  const request = () =>
    new Request("http://127.0.0.1:3230/api/webhooks/resend", {
      method: "POST",
      headers: {
        "svix-id": eventId,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
      body: payload,
    });
  assert.equal((await resendWebhook(request())).status, 200);
  assert.equal((await resendWebhook(request())).status, 200);
  assert.equal(
    (
      await admin.query(
        "select state from kxra.transactional_email_outbox where id=$1",
        [invitation.outbox_id],
      )
    ).rows[0].state,
    "DELIVERED",
  );
  const invalid = request();
  invalid.headers.set("svix-signature", "v1,invalid");
  assert.equal((await resendWebhook(invalid)).status, 400);
});

test("revocation after claim cancels before provider delivery", async () => {
  const invitation = await queuedInvitation();
  const worker = `fixture-email-${crypto.randomUUID()}`;
  await transaction("kxra_email_worker", async (database) => {
    const claimed = await database.query(
      "select * from kxra_private.claim_transactional_email($1)",
      [worker],
    );
    assert.equal(claimed.rows[0].outbox_id, invitation.outbox_id);
  });
  await transaction("authenticated", (database) =>
    database.query("select kxra.revoke_invitation($1)", [invitation.id]),
  );
  await transaction("kxra_email_worker", async (database) => {
    const authorized = await database.query<{ allowed: boolean }>(
      "select kxra_private.authorize_transactional_email($1,$2) allowed",
      [invitation.outbox_id, worker],
    );
    assert.equal(authorized.rows[0].allowed, false);
  });
  assert.equal(
    (
      await admin.query(
        "select state from kxra.transactional_email_outbox where id=$1",
        [invitation.outbox_id],
      )
    ).rows[0].state,
    "CANCELLED",
  );
});

test("uncertain provider outcome blocks token replacement until reconciliation", async () => {
  const invitation = await queuedInvitation();
  const worker = `fixture-email-${crypto.randomUUID()}`;
  await transaction("kxra_email_worker", async (database) => {
    await database.query(
      "select * from kxra_private.claim_transactional_email($1)",
      [worker],
    );
    assert.equal(
      (
        await database.query<{ allowed: boolean }>(
          "select kxra_private.authorize_transactional_email($1,$2) allowed",
          [invitation.outbox_id, worker],
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await database.query<{ state: string }>(
          "select kxra_private.complete_transactional_email($1,$2,'AMBIGUOUS',null,'RESEND_TRANSPORT_UNKNOWN',null) state",
          [invitation.outbox_id, worker],
        )
      ).rows[0].state,
      "RECONCILIATION_REQUIRED",
    );
  });
  await assert.rejects(
    transaction("authenticated", (database) =>
      database.query("select * from kxra.resend_invitation($1,$2)", [
        invitation.id,
        crypto.createHash("sha256").update("replacement").digest("hex"),
      ]),
    ),
    /requires reconciliation/,
  );
});
