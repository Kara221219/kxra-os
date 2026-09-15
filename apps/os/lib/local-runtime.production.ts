import type { Principal } from "../../../packages/db";
import type {
  AuthIdentity,
  AuthProvider,
} from "../../../packages/authz/provider";
import type { FakeEmailTransport } from "../../../packages/integrations/email";

function unavailable(): never {
  throw new Error("Local authentication is unavailable");
}

export function fakeAuthProvider(): AuthProvider {
  return unavailable();
}

export function fakeEmailTransport(): FakeEmailTransport {
  return unavailable();
}

export function joinSecret() {
  const value = process.env.KXRA_JOIN_SECRET;
  if (!value || value.length < 48)
    throw new Error("Join configuration unavailable");
  return value;
}

export async function localPrincipal(): Promise<Principal | null> {
  return null;
}

export async function issueFixtureSession(_fixture: string): Promise<void> {
  unavailable();
}

export async function issueLocalProviderSession(
  _identity: AuthIdentity,
  _accountSessionVersion: number,
): Promise<void> {
  unavailable();
}

export async function clearAuthCookies(): Promise<void> {
  unavailable();
}
