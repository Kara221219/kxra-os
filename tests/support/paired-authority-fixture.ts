import crypto from "node:crypto";
import {
  pairedRuntimeSubject,
  pairedTextPolicyDigest,
  type PairedExecutionAuthority,
} from "../../packages/workspace/paired-execution-admission";
export function syntheticPairedAuthority(
  org: string,
  account: string,
  room: string,
  thread: string,
  membership = 1,
): PairedExecutionAuthority {
  const id = () => crypto.randomUUID(),
    h = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  const expires = new Date(Date.now() + 120000).toISOString();
  const value: PairedExecutionAuthority = {
    purpose: "PAIRED_TEXT_EXECUTION_V1",
    revision: id(),
    context: { organization_id: org, account_id: account, session_revision: 1 },
    device_id: id(),
    device_session_id: id(),
    realm_id: id(),
    continuity_epoch: id(),
    membership: {
      organization_id: org,
      account_id: account,
      room_id: room,
      state: "ACTIVE",
      revision: membership,
    },
    task: {
      id: id(),
      agent_id: id(),
      room_id: room,
      thread_id: thread,
      content_hash: h("synthetic approved source"),
      fence: id(),
      lease_until: expires,
      objective: "Synthetic local authority test only",
      sources: [{ id: thread, thread, body: "Synthetic paired source" }],
    },
    approval: {
      id: id(),
      content_hash: h("synthetic approved source"),
      state: "APPROVED",
    },
    runtime: {
      executable_sha256: h("stub"),
      protocol_schema_sha256: h("stub schema"),
      configuration_sha256: h("stub configuration"),
      tool_policy_sha256: pairedTextPolicyDigest(),
      isolation_receipt_sha256: h("synthetic isolation"),
      host_identity_sha256: h("synthetic host"),
      auth_binding_sha256: h("synthetic account"),
      model_sha256: h("synthetic model"),
    },
    runtime_review: {
      id: id(),
      reviewer_id: id(),
      subject_sha256: h("pending"),
      state: "ACCEPTED",
      evidence_sha256: h("synthetic review"),
      expires_at: expires,
    },
    auth_review: {
      id: id(),
      state: "ACCEPTED",
      scope: "CUSTOMER_OWNED_PAIRED_TEXT",
      binding_sha256: h("synthetic account"),
      evidence_sha256: h("synthetic eligibility"),
      expires_at: expires,
    },
  };
  value.runtime_review.subject_sha256 = pairedRuntimeSubject(value);
  return value;
}
