import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  executeAdmittedPairedText,
  pairedAdmissionDigest,
  pairedRuntimeSubject,
  pairedTextPolicyDigest,
  type PairedAdmissionPorts,
  type PairedExecutionAuthority,
} from "../packages/workspace/paired-execution-admission";
const id = () => crypto.randomUUID(),
  h = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
function fixture() {
  let clock = Date.UTC(2026, 10, 5),
    consumed = false,
    reads = 0,
    measures = 0,
    executions = 0,
    publications = 0;
  const context = {
    organization_id: id(),
    account_id: id(),
    session_revision: 4,
  };
  const thread = id(),
    room = id();
  const a: PairedExecutionAuthority = {
    purpose: "PAIRED_TEXT_EXECUTION_V1",
    revision: id(),
    context,
    device_id: id(),
    device_session_id: id(),
    realm_id: id(),
    continuity_epoch: id(),
    membership: {
      organization_id: context.organization_id,
      account_id: context.account_id,
      room_id: room,
      state: "ACTIVE",
      revision: 1,
    },
    task: {
      id: id(),
      agent_id: id(),
      room_id: room,
      thread_id: thread,
      content_hash: h("approved source"),
      fence: id(),
      lease_until: new Date(clock + 30000).toISOString(),
      objective: "Synthetic admission draft",
      sources: [{ id: id(), body: "Synthetic evidence only", thread }],
    },
    approval: {
      id: id(),
      state: "APPROVED",
      content_hash: h("approved source"),
    },
    runtime: {
      executable_sha256: h("stub executable"),
      protocol_schema_sha256: h("stub schema"),
      configuration_sha256: h("loaded config"),
      tool_policy_sha256: pairedTextPolicyDigest(),
      isolation_receipt_sha256: h("synthetic isolation proof"),
      host_identity_sha256: h("stub host"),
      auth_binding_sha256: h("fake account binding"),
      model_sha256: h("stub model"),
    },
    runtime_review: {
      id: id(),
      reviewer_id: id(),
      subject_sha256: "0".repeat(64),
      state: "ACCEPTED",
      evidence_sha256: h("synthetic review"),
      expires_at: new Date(clock + 60000).toISOString(),
    },
    auth_review: {
      id: id(),
      state: "ACCEPTED",
      scope: "CUSTOMER_OWNED_PAIRED_TEXT",
      binding_sha256: h("fake account binding"),
      evidence_sha256: h("synthetic eligibility"),
      expires_at: new Date(clock + 60000).toISOString(),
    },
  };
  a.runtime_review.subject_sha256 = pairedRuntimeSubject(a);
  const request = { task_id: a.task.id, fence: a.task.fence, attempt_id: id() };
  const port: PairedAdmissionPorts = {
    context: structuredClone(context),
    async readCurrent() {
      reads++;
      return structuredClone(a);
    },
    async measureRuntime() {
      measures++;
      return structuredClone(a.runtime);
    },
    async consume(input) {
      if (consumed) return { state: "ALREADY_CONSUMED" };
      consumed = true;
      assert.equal(input.snapshot_sha256, pairedAdmissionDigest(a));
      return {
        state: "CONSUMED",
        permit_id: id(),
        snapshot_sha256: input.snapshot_sha256,
        realm_id: a.realm_id,
        continuity_epoch: a.continuity_epoch,
        expires_at: new Date(
          Math.min(
            ...[
              a.task.lease_until,
              a.runtime_review.expires_at,
              a.auth_review.expires_at,
            ].map(Date.parse),
          ),
        ).toISOString(),
      };
    },
    async execute(input) {
      executions++;
      assert.equal(Object.isFrozen(input.task), true);
      assert.equal(input.snapshot_sha256, pairedAdmissionDigest(a));
      assert.equal(input.permit.snapshot_sha256, input.snapshot_sha256);
      return "Synthetic accepted draft";
    },
    async publish(input) {
      publications++;
      return {
        state: "DONE",
        message_id: id(),
        snapshot_sha256: input.snapshot_sha256,
        permit_id: input.permit.permit_id,
      };
    },
  };
  return {
    a,
    request,
    port,
    now: () => clock,
    advance: (n: number) => {
      clock += n;
    },
    counts: () => ({ reads, measures, executions, publications, consumed }),
  };
}
test("admission defaults closed; caller authority fields never reach trusted ports", async () => {
  assert.deepEqual(await executeAdmittedPairedText({}), {
    state: "BLOCKED",
    reason: "ADMISSION_UNAVAILABLE",
  });
  for (const extra of [
    { actor_id: id() },
    { provider_verified: true },
    { runtime_review: { state: "ACCEPTED" } },
  ]) {
    const f = fixture();
    assert.equal(
      (
        await executeAdmittedPairedText(
          { ...f.request, ...extra },
          f.port,
          undefined,
          f.now,
        )
      ).state,
      "BLOCKED",
    );
    assert.equal(f.counts().reads, 0);
  }
});
test("exact authority and twice-measured runtime consume once, execute once and publish bound receipt", async () => {
  const f = fixture();
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "DONE",
  );
  assert.deepEqual(f.counts(), {
    reads: 5,
    measures: 2,
    executions: 1,
    publications: 1,
    consumed: true,
  });
  assert.equal(
    (
      await executeAdmittedPairedText(
        { ...f.request, attempt_id: id() },
        f.port,
        undefined,
        f.now,
      )
    ).state,
    "ALREADY_CONSUMED",
  );
  assert.equal(f.counts().executions, 1);
});
test("foreign tenant/session/device task/fence, self-review and incorrect purpose/source/approval deny before consumption", async () => {
  const edits: Array<(a: PairedExecutionAuthority) => void> = [
    (a) => {
      a.context.organization_id = id();
    },
    (a) => {
      a.context.session_revision++;
    },
    (a) => {
      a.membership.account_id = id();
    },
    (a) => {
      a.membership.room_id = id();
    },
    (a) => {
      a.task.id = id();
    },
    (a) => {
      a.task.fence = id();
    },
    (a) => {
      a.task.sources[0].thread = id();
    },
    (a) => {
      a.approval.content_hash = h("foreign");
    },
    (a) => {
      a.runtime_review.reviewer_id = a.context.account_id;
    },
    (a) => {
      a.device_session_id = id();
    },
    (a) => {
      (a as any).purpose = "GITHUB_SEND";
    },
    (a) => {
      (a.auth_review as any).state = "REVIEW_REQUIRED";
    },
  ];
  for (const edit of edits) {
    const f = fixture();
    edit(f.a);
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "BLOCKED",
    );
    assert.equal(f.counts().consumed, false);
    assert.equal(f.counts().executions, 0);
  }
});
test("every changed runtime artifact and expired/revoked review fails without dispatch", async () => {
  for (const key of Object.keys(fixture().a.runtime)) {
    const f = fixture();
    const actual = { ...f.a.runtime, [key]: h("changed") };
    f.port.measureRuntime = async () => actual;
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "BLOCKED",
      key,
    );
    assert.equal(f.counts().consumed, false);
  }
  for (const edit of [
    (f: ReturnType<typeof fixture>) => {
      f.a.runtime_review.expires_at = new Date(f.now() - 1).toISOString();
    },
    (f: ReturnType<typeof fixture>) => {
      f.a.auth_review.expires_at = new Date(f.now() - 1).toISOString();
    },
    (f: ReturnType<typeof fixture>) => {
      f.advance(30001);
    },
  ]) {
    const f = fixture();
    edit(f);
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "BLOCKED",
    );
    assert.equal(f.counts().executions, 0);
  }
});
test("withdrawal during measurement, consume wait and second measurement refuses dispatch", async () => {
  {
    const f = fixture();
    f.port.measureRuntime = async () => {
      f.a.revision = id();
      return f.a.runtime;
    };
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "BLOCKED",
    );
    assert.equal(f.counts().executions, 0);
  }
  {
    const f = fixture(),
      consume = f.port.consume;
    f.port.consume = async (input) => {
      const p = await consume(input);
      f.a.membership.revision++;
      return p;
    };
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "UNCERTAIN",
    );
    assert.equal(f.counts().executions, 0);
  }
  {
    const f = fixture();
    let n = 0;
    f.port.measureRuntime = async () =>
      ++n === 1
        ? f.a.runtime
        : { ...f.a.runtime, executable_sha256: h("replaced image") };
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "UNCERTAIN",
    );
    assert.equal(f.counts().executions, 0);
  }
});
test("concurrent attempts require one task/fence consumption across operation IDs", async () => {
  const f = fixture();
  const r = await Promise.all([
    executeAdmittedPairedText(f.request, f.port, undefined, f.now),
    executeAdmittedPairedText(
      { ...f.request, attempt_id: id() },
      f.port,
      undefined,
      f.now,
    ),
  ]);
  assert.equal(r.filter((x) => x.state === "DONE").length, 1);
  assert.equal(r.filter((x) => x.state === "ALREADY_CONSUMED").length, 1);
  assert.equal(f.counts().executions, 1);
});
test("lost consumption acknowledgment never dispatches or retries; later attempt remains consumed", async () => {
  const f = fixture(),
    consume = f.port.consume;
  f.port.consume = async (input) => {
    await consume(input);
    throw Error("synthetic lost ACK");
  };
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "UNCERTAIN",
  );
  assert.equal(f.counts().executions, 0);
  f.port.consume = consume;
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "ALREADY_CONSUMED",
  );
  assert.equal(f.counts().executions, 0);
});
test("cancellation/expiry/authority withdrawal during execution withholds publication", async () => {
  for (const stage of ["abort", "expiry", "withdraw"]) {
    const f = fixture(),
      controller = new AbortController();
    f.port.execute = async () => {
      if (stage === "abort") controller.abort();
      if (stage === "expiry") f.advance(30001);
      if (stage === "withdraw") f.a.revision = id();
      return "Synthetic late draft";
    };
    assert.equal(
      (
        await executeAdmittedPairedText(
          f.request,
          f.port,
          controller.signal,
          f.now,
        )
      ).state,
      "UNCERTAIN",
    );
    assert.equal(f.counts().publications, 0);
  }
});
test("forged permits and publication responses fail closed without replay", async () => {
  for (const field of [
    "snapshot_sha256",
    "realm_id",
    "continuity_epoch",
    "expires_at",
  ]) {
    const f = fixture(),
      consume = f.port.consume;
    f.port.consume = async (input) => ({
      ...((await consume(input)) as object),
      [field]:
        field === "expires_at"
          ? new Date(f.now() + 60000).toISOString()
          : field === "snapshot_sha256"
            ? h("wrong")
            : id(),
    });
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "UNCERTAIN",
    );
    assert.equal(f.counts().executions, 0);
  }
  const f = fixture();
  f.port.publish = async () => {
    throw Error("lost publication ACK");
  };
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "UNCERTAIN",
  );
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "ALREADY_CONSUMED",
  );
  assert.equal(f.counts().executions, 1);
});

test("deadline bounds noncooperative ports; lost consumption remains uncertain without execution", async () => {
  const f = fixture();
  f.port.measureRuntime = async () => new Promise(() => {});
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now, 10))
      .state,
    "BLOCKED",
  );
  assert.equal(f.counts().executions, 0);
  const g = fixture();
  g.port.consume = async () => new Promise(() => {});
  assert.equal(
    (await executeAdmittedPairedText(g.request, g.port, undefined, g.now, 10))
      .state,
    "UNCERTAIN",
  );
  assert.equal(g.counts().executions, 0);
});
test("authority withdrawn during final measurement is checked again before dispatch", async () => {
  const f = fixture();
  let calls = 0;
  f.port.measureRuntime = async () => {
    if (++calls === 2) f.a.revision = id();
    return f.a.runtime;
  };
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
      .state,
    "UNCERTAIN",
  );
  assert.equal(f.counts().executions, 0);
});

test("elapsed monotonic deadline cannot be bypassed by delayed timer delivery", async () => {
  const f = fixture();
  f.port.measureRuntime = async () => {
    const until = performance.now() + 15;
    while (performance.now() < until) {}
    return f.a.runtime;
  };
  assert.equal(
    (await executeAdmittedPairedText(f.request, f.port, undefined, f.now, 5))
      .state,
    "BLOCKED",
  );
  assert.equal(f.counts().executions, 0);
});

test("earliest authority or permit expiry aborts a cooperative executor", async () => {
  for (const stage of ["lease", "runtime-review", "auth-review", "permit"]) {
    const f = fixture(),
      end = new Date(f.now() + 50).toISOString();
    if (stage === "lease") f.a.task.lease_until = end;
    if (stage === "runtime-review") f.a.runtime_review.expires_at = end;
    if (stage === "auth-review") {
      f.a.auth_review.expires_at = end;
      f.a.runtime_review.subject_sha256 = pairedRuntimeSubject(f.a);
    }
    const consume = f.port.consume;
    if (stage === "permit")
      f.port.consume = async (input) => ({
        ...((await consume(input)) as object),
        expires_at: end,
      });
    let observed = false;
    f.port.execute = async (_input, signal) =>
      new Promise((resolve) => {
        signal!.addEventListener(
          "abort",
          () => {
            observed = true;
            resolve("Synthetic expired draft");
          },
          { once: true },
        );
      });
    assert.equal(
      (await executeAdmittedPairedText(f.request, f.port, undefined, f.now))
        .state,
      "UNCERTAIN",
      stage,
    );
    assert.equal(observed, true, stage);
    assert.equal(f.counts().publications, 0);
  }
});
