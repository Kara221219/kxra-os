import crypto from "node:crypto";
import { z } from "zod";
const claimsSchema = z
  .object({
    purpose: z.literal("synthetic-connector-agent-v1"),
    user_id: z.string().uuid(),
    org_id: z.string().uuid(),
    connector_id: z.string().uuid(),
    session_version: z.number().int().positive(),
    expires_at: z.number().int(),
  })
  .strict();
export type AgentCapability = z.infer<typeof claimsSchema>;
export function mintConnectorCapability(
  claims: Omit<AgentCapability, "purpose" | "expires_at">,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 64)
    throw Error("Synthetic capability secret unavailable");
  const payload = Buffer.from(
    JSON.stringify(
      claimsSchema.parse({
        ...claims,
        purpose: "synthetic-connector-agent-v1",
        expires_at: now + 5 * 60_000,
      }),
    ),
  ).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyConnectorCapability(
  token: string,
  secret: string,
  now = Date.now(),
): AgentCapability | null {
  try {
    if (secret.length < 64 || token.length > 2048) return null;
    const [payload, signature, ...extra] = token.split(".");
    if (extra.length || !payload || !signature) return null;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      return null;
    const claims = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (claims.expires_at <= now || claims.expires_at > now + 5 * 60_000)
      return null;
    return claims;
  } catch {
    return null;
  }
}
