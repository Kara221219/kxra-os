// Synthetic cryptographic issuer/transport, imported by local tests only. Keys/tokens never persisted.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveVerifiedSupabasePrincipal } from "../../packages/authz/hosted-session-attestation";
export function syntheticVerifiedSession(claims: Record<string, unknown>) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }),
    kid = crypto.randomUUID();
  const header = Buffer.from(
      JSON.stringify({ alg: "ES256", kid, typ: "JWT" }),
    ).toString("base64url"),
    body = Buffer.from(JSON.stringify(claims)).toString("base64url"),
    unsigned = header + "." + body;
  const token =
    unsigned +
    "." +
    crypto
      .sign("sha256", Buffer.from(unsigned), {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      })
      .toString("base64url");
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid,
    alg: "ES256",
    use: "sig",
    key_ops: ["verify"],
    kty: "EC",
  };
  const transport: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://synthetic-auth.invalid/auth/v1/user");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer " + token);
    return new Response(
      JSON.stringify({
        id: claims.sub,
        aud: "authenticated",
        role: "authenticated",
        email: "synthetic@example.invalid",
        email_confirmed_at: new Date().toISOString(),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = createClient(
    "https://synthetic-auth.invalid",
    "synthetic-not-a-real-publishable-key",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: transport },
    },
  );
  return {
    async principal() {
      return resolveVerifiedSupabasePrincipal({
        auth: {
          getUser: () => client.auth.getUser(token),
          getClaims: () =>
            client.auth.getClaims(token, { jwks: { keys: [jwk] } }),
        },
      });
    },
    async alteredPrincipal(payload: Record<string, unknown>) {
      const altered =
        header +
        "." +
        Buffer.from(JSON.stringify(payload)).toString("base64url") +
        "." +
        token.split(".")[2];
      return resolveVerifiedSupabasePrincipal({
        auth: {
          getUser: () => client.auth.getUser(token),
          getClaims: () =>
            client.auth.getClaims(altered, { jwks: { keys: [jwk] } }),
        },
      });
    },
    async mismatchedPrincipal() {
      return resolveVerifiedSupabasePrincipal({
        auth: {
          getUser: async () => ({
            data: { user: { id: crypto.randomUUID() } },
            error: null,
          }),
          getClaims: () =>
            client.auth.getClaims(token, { jwks: { keys: [jwk] } }),
        },
      });
    },
  };
}
export function syntheticSessionClaims(
  user: string,
  session: string,
  version?: number,
) {
  return {
    iss: "https://synthetic-auth.invalid/auth/v1",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    sub: user,
    role: "authenticated",
    aal: "aal2",
    session_id: session,
    email: "synthetic@example.invalid",
    phone: "",
    is_anonymous: false,
    amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
    ...(version ? { kxra_session_version: version } : {}),
  };
}
