import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const partner = "20000000-0000-4000-8000-000000000002";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

after(() => admin.end());

async function as(db: pg.PoolClient, user: string | null) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user || "",
      JSON.stringify({
        sub: user,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? org : "",
    ],
  );
}

async function worker(db: pg.PoolClient) {
  await db.query("reset role");
  await db.query("set local role kxra_whatsapp_worker");
}

async function tx(work: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await work(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
}

async function createPairing(db: pg.PoolClient) {
  const phone = hash("+447700900001");
  const token = hash("synthetic-one-use-pairing-token");
  await as(db, partner);
  const challenge = (
    await db.query(
      "select kxra.create_whatsapp_pairing_challenge($1,$2,$3,$4,$5,now()+interval '10 minutes') id",
      [phone, "WABA-SYNTHETIC", "NUMBER-SYNTHETIC", token, crypto.randomUUID()],
    )
  ).rows[0].id;
  await worker(db);
  const pairing = (
    await db.query(
      "select kxra_private.complete_whatsapp_pairing($1,$2,$3,$4,$5) id",
      [challenge, token, phone, "WABA-SYNTHETIC", "NUMBER-SYNTHETIC"],
    )
  ).rows[0].id;
  assert.ok(pairing);
  return { challenge, pairing, phone, token };
}

test("AT-15 one-use pairing binds the current account, phone and Meta number", () =>
  tx(async (db) => {
    const phone = hash("+447700900002");
    const token = hash("another-one-use-token");
    await as(db, partner);
    const request = crypto.randomUUID();
    const challenge = (
      await db.query(
        "select kxra.create_whatsapp_pairing_challenge($1,$2,$3,$4,$5,now()+interval '10 minutes') id",
        [phone, "WABA-2", "NUMBER-2", token, request],
      )
    ).rows[0].id;
    const replay = (
      await db.query(
        "select kxra.create_whatsapp_pairing_challenge($1,$2,$3,$4,$5,now()+interval '10 minutes') id",
        [phone, "WABA-2", "NUMBER-2", token, request],
      )
    ).rows[0].id;
    assert.equal(replay, challenge);
    await worker(db);
    assert.equal(
      (
        await db.query(
          "select kxra_private.complete_whatsapp_pairing($1,$2,$3,$4,$5) id",
          [challenge, hash("wrong"), phone, "WABA-2", "NUMBER-2"],
        )
      ).rows[0].id,
      null,
    );
    await db.query("reset role");
    assert.equal(
      (
        await db.query(
          "select attempt_count from kxra.whatsapp_pairing_challenges where id=$1",
          [challenge],
        )
      ).rows[0].attempt_count,
      1,
    );
    await worker(db);
    const pairing = (
      await db.query(
        "select kxra_private.complete_whatsapp_pairing($1,$2,$3,$4,$5) id",
        [challenge, token, phone, "WABA-2", "NUMBER-2"],
      )
    ).rows[0].id;
    assert.ok(pairing);
    assert.equal(
      (
        await db.query(
          "select kxra_private.complete_whatsapp_pairing($1,$2,$3,$4,$5) id",
          [challenge, token, phone, "WABA-2", "NUMBER-2"],
        )
      ).rows[0].id,
      null,
    );
  }));

test("AT-16 signed-worker ingress deduplicates and never broadens project scope", () =>
  tx(async (db) => {
    const { pairing, phone } = await createPairing(db);
    await as(db, partner);
    await denied(db, "select kxra.select_whatsapp_project($1,$2,$3)", [
      pairing,
      p3,
      crypto.randomUUID(),
    ]);
    const selectionRequest = crypto.randomUUID();
    const selection = (
      await db.query("select kxra.select_whatsapp_project($1,$2,$3) id", [
        pairing,
        p2,
        selectionRequest,
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select kxra.select_whatsapp_project($1,$2,$3) id", [
          pairing,
          p2,
          selectionRequest,
        ])
      ).rows[0].id,
      selection,
    );
    await worker(db);
    const input = [
      "event-001",
      "message-001",
      hash("raw-provider-body"),
      phone,
      "WABA-SYNTHETIC",
      "NUMBER-SYNTHETIC",
      "RESEARCH_REQUEST",
      hash("bounded message content"),
      "private://whatsapp/message-001",
      null,
      null,
      null,
      null,
      false,
    ];
    const first = (
      await db.query(
        "select * from kxra_private.ingest_whatsapp_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        input,
      )
    ).rows[0];
    const replay = (
      await db.query(
        "select * from kxra_private.ingest_whatsapp_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        input,
      )
    ).rows[0];
    assert.equal(first.project_id, p2);
    assert.equal(first.deduplicated, false);
    assert.equal(replay.message_id, first.message_id);
    assert.equal(replay.deduplicated, true);
    const intent = (
      await db.query(
        "select kxra_private.create_whatsapp_outbound_intent($1,$2,$3,$4) id",
        [
          first.message_id,
          hash("bounded response"),
          "private://whatsapp/response-001",
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "select kxra_private.reauthorize_whatsapp_outbound($1) reason",
          [intent],
        )
      ).rows[0].reason,
      "ADAPTER_DISABLED",
    );
    await db.query("reset role");
    const stored = (
      await db.query(
        "select adapter,state,delivery_state,cancellation_code from kxra.whatsapp_outbound_intents where id=$1",
        [intent],
      )
    ).rows[0];
    assert.deepEqual(stored, {
      adapter: "DISABLED",
      state: "CANCELLED",
      delivery_state: "NOT_SENT",
      cancellation_code: "ADAPTER_DISABLED",
    });
  }));

test("AT-15/16 RLS, media consent and revocation fail closed", () =>
  tx(async (db) => {
    const { pairing, phone } = await createPairing(db);
    await as(db, partner);
    await db.query("select kxra.select_whatsapp_project($1,$2,$3)", [
      pairing,
      p2,
      crypto.randomUUID(),
    ]);
    await worker(db);
    const message = (
      await db.query(
        "select * from kxra_private.ingest_whatsapp_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        [
          "event-voice",
          "message-voice",
          hash("voice-payload"),
          phone,
          "WABA-SYNTHETIC",
          "NUMBER-SYNTHETIC",
          "VOICE_NOTE",
          hash("encrypted-media-reference"),
          "private://whatsapp/message-voice",
          "media-voice",
          "VOICE",
          "audio/ogg",
          1024,
          false,
        ],
      )
    ).rows[0];
    await db.query("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select scan_state,transcription_consent,transcription_state from kxra.whatsapp_media_items where message_id=$1",
          [message.message_id],
        )
      ).rows[0],
      {
        scan_state: "NOT_FETCHED",
        transcription_consent: false,
        transcription_state: "BLOCKED",
      },
    );
    await as(db, partner);
    await denied(
      db,
      "update kxra.whatsapp_messages set state='PROPOSED' where id=$1",
      [message.message_id],
    );
    await as(db, null);
    assert.equal(
      (await db.query("select * from kxra.whatsapp_messages")).rowCount,
      0,
    );
    await as(db, owner);
    assert.equal(
      (await db.query("select * from kxra.whatsapp_messages")).rowCount,
      1,
    );
    await as(db, partner);
    await db.query("select kxra.revoke_whatsapp_pairing($1,$2,$3)", [
      pairing,
      "Partner requested immediate revocation",
      crypto.randomUUID(),
    ]);
    await worker(db);
    await assert.rejects(() =>
      db.query(
        "select * from kxra_private.ingest_whatsapp_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        [
          "event-after-revoke",
          "message-after-revoke",
          hash("after-revoke"),
          phone,
          "WABA-SYNTHETIC",
          "NUMBER-SYNTHETIC",
          "NOTE",
          hash("no access"),
          "private://none",
          null,
          null,
          null,
          null,
          false,
        ],
      ),
    );
  }));
