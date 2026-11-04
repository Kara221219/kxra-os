import crypto from "node:crypto";
import { z } from "zod";
export const aiAdmissionReceipt = z
  .object({
    connection_id: z.string().uuid(),
    state: z.enum(["ELIGIBLE", "BLOCKED", "REVIEW_REQUIRED"]),
  })
  .strict();
/** Private, per-intent fingerprint. It is never a provider credential or authority. */
export function aiCredentialFingerprint(id: string, key: string) {
  return crypto
    .createHash("sha256")
    .update("kxra-ai-intent-v1\0")
    .update(z.string().uuid().parse(id))
    .update("\0")
    .update(key)
    .digest("hex");
}
export type AiAdmissionCall = (input: {
  connection_id: string;
  provider: string;
  model: string;
  endpoint_id: string;
  fingerprint: string;
  endpoint_sha256: string;
}) => Promise<unknown>;
export async function admitAiConnection(
  input: {
    admission_id?: string;
    provider: string;
    model: string;
    endpoint_id: string;
    key: string;
    endpoint_sha256: string;
  },
  call: AiAdmissionCall,
) {
  const connection_id = input.admission_id || crypto.randomUUID(),
    fingerprint = aiCredentialFingerprint(connection_id, input.key);
  const result = aiAdmissionReceipt.parse(
    await call({
      connection_id,
      provider: input.provider,
      model: input.model,
      endpoint_id: input.endpoint_id,
      fingerprint,
      endpoint_sha256: input.endpoint_sha256,
    }),
  );
  if (result.connection_id !== connection_id)
    throw Error("AI_ADMISSION_UNAVAILABLE");
  return { ...result, fingerprint };
}
export class AiConnectionReviewRequired extends Error {
  constructor(public readonly receipt: z.infer<typeof aiAdmissionReceipt>) {
    super("AI_CONNECTION_REVIEW_REQUIRED");
  }
}
/** Calls the vault only after the exact intent has current server-owned clearance. */
export async function sealAdmittedAiConnection(
  input: Parameters<typeof admitAiConnection>[0],
  org: string,
  call: AiAdmissionCall,
  seal: (key: string, scope: string) => string,
) {
  const decision = await admitAiConnection(input, call);
  if (decision.state !== "ELIGIBLE")
    throw new AiConnectionReviewRequired({
      connection_id: decision.connection_id,
      state: decision.state,
    });
  return {
    ...decision,
    encrypted: seal(input.key, `${org}:${decision.connection_id}`),
  };
}
