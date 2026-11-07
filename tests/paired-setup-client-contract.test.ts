import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  parsePairedSetupReceipt,
  parsePairedSetupOptions,
} from "../packages/workspace/paired-setup-client-contract";
import {
  pairedSetupReceipt,
  pairedSetupOptions,
} from "../packages/workspace/paired-setup-contract";
const id = () => crypto.randomUUID();
const receipt = {
  request_id: id(),
  agent_id: id(),
  room_id: id(),
  reason: "CANCELLED",
  expires_at: "2026-11-07T23:59:59.000Z",
  activation_allowed: false,
  credential_issued: false,
};
const options = {
  rooms: [{ id: id(), name: "Room" }],
  ai_intents: [{ id: id(), model: "Model" }],
  requests: [{ id: id(), agent_id: id(), room_id: id(), label: "Agent" }],
};
test("small browser projections accept canonical setup receipts and options", () => {
  assert.deepEqual(
    parsePairedSetupReceipt(pairedSetupReceipt.parse(receipt)),
    receipt,
  );
  assert.deepEqual(
    parsePairedSetupOptions(pairedSetupOptions.parse(options)),
    options,
  );
});
test("browser projections reject secrets, authority, malformed IDs and unbounded data", () => {
  for (const value of [
    { ...receipt, token: "secret" },
    { ...receipt, activation_allowed: true },
    { ...receipt, credential_issued: true },
    { ...receipt, request_id: "not-id" },
    { ...receipt, reason: "RUNNING" },
    { ...receipt, expires_at: "tomorrow" },
    null,
    [],
  ])
    assert.throws(() => parsePairedSetupReceipt(value));
  for (const value of [
    { ...options, secret: "hidden" },
    { ...options, rooms: Array(51).fill(options.rooms[0]) },
    { ...options, ai_intents: [{ id: id(), model: "x".repeat(161) }] },
    { ...options, requests: [{ ...options.requests[0], token: "secret" }] },
    null,
    [],
  ])
    assert.throws(() => parsePairedSetupOptions(value));
});
