import crypto from "node:crypto";
import { hostedRegistration } from "../authz/hosted-self-service";

export type HostedSignupPorts = {
  prepare: (
    emailDigest: string,
    proofDigest: string,
    request: string,
  ) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    options: {
      emailRedirectTo: string;
      data: { kxra_self_service_challenge: string };
    };
  }) => Promise<{ error: unknown }>;
};

/** Genuine SDK orchestration; tests inject transport only, never hosted identity. */
export async function registerHostedSelfService(
  input: unknown,
  origin: string,
  ports: HostedSignupPorts,
) {
  const value = hostedRegistration.parse(input);
  const challenge = crypto.randomBytes(32).toString("base64url");
  const digest = (text: string) =>
    crypto.createHash("sha256").update(text).digest("hex");
  await ports.prepare(
    digest(value.email),
    digest(challenge),
    crypto.randomUUID(),
  );
  let result: { error: unknown };
  try {
    result = await ports.signUp({
      email: value.email,
      password: value.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/signup`,
        data: { kxra_self_service_challenge: challenge },
      },
    });
  } catch {
    throw Error("HOSTED_SIGNUP_PROVIDER_UNAVAILABLE");
  }
  if (result.error) throw Error("HOSTED_SIGNUP_PROVIDER_UNAVAILABLE");
  // Supabase intentionally obscures existing accounts. Do not infer identity,
  // delivery or workspace authority from the signUp response or client metadata.
  return { next: "/signup?verify=1" };
}
