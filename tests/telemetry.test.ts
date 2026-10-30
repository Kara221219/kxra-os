import assert from "node:assert/strict";
import test from "node:test";
import {
  captureTelemetry,
  DisabledTelemetrySink,
  telemetryEnvelope,
  type TelemetryEnvelope,
  type TelemetrySink,
} from "../packages/integrations/telemetry";

test("telemetry emits only the closed opaque operational envelope", async () => {
  const captured: TelemetryEnvelope[] = [];
  const sink: TelemetrySink = {
    async capture(value) {
      captured.push(value);
    },
  };
  await captureTelemetry(sink, "public_enquiry.accepted", {
    request_id: "d6a03932-6e1d-4b9f-aa17-32830accedd0",
    route_id: "public-enquiry",
    outcome: "accepted",
    status_code: 202,
    duration_bucket: "under-250ms",
  });
  assert.equal(captured.length, 1);
  assert.deepEqual(Object.keys(captured[0]).sort(), [
    "event",
    "event_id",
    "metadata",
    "occurred_at",
    "schema",
  ]);
  assert.equal(JSON.stringify(captured[0]).includes("@"), false);
  await new DisabledTelemetrySink().capture(captured[0]);
});

test("telemetry fails closed for identity, content, secrets and unbounded values", () => {
  for (const [key, value] of [
    ["email", "person@example.com"],
    ["project_id", "d6a03932-6e1d-4b9f-aa17-32830accedd0"],
    ["message", "private customer text"],
    ["operation", "person@example.com"],
    ["provider", "Bearer private-token"],
    ["unknown", "value"],
    ["operation", { nested: "value" }],
  ] as const) {
    assert.throws(() =>
      telemetryEnvelope("http.request.completed", { [key]: value }),
    );
  }
  assert.throws(() =>
    telemetryEnvelope("http.request.completed", { request_id: "not-opaque" }),
  );
  assert.throws(() =>
    telemetryEnvelope("not-an-event" as never, { outcome: "ok" }),
  );
});

test("unknown-format BYOK values cannot hide in otherwise allowed categorical fields", () => {
  for (const key of [
    "provider",
    "operation",
    "outcome",
    "environment",
    "release",
    "route_id",
    "duration_bucket",
    "status_code",
  ]) {
    for (const secret of [
      "AIza_SYNTHETIC_NOT_A_REAL_PROVIDER_KEY",
      "synthetic-opaque-customer-key-value",
    ]) {
      assert.throws(() =>
        telemetryEnvelope("worker.run.completed", { [key]: secret }),
      );
    }
  }
  assert.equal(
    telemetryEnvelope("worker.run.completed", {
      provider: "GOOGLE",
      operation: "generate",
      outcome: "ok",
      status_code: 200,
    }).metadata.provider,
    "GOOGLE",
  );
});
