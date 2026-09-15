export type AuthAssurance = "aal1" | "aal2";
export type ProviderMfaState =
  "NOT_ENROLLED" | "ENROLLING" | "ENROLLED" | "RECOVERY_REQUIRED";

export type AuthIdentity = {
  id: string;
  email: string;
  emailVerified: boolean;
  aal: AuthAssurance;
  providerSessionVersion: number;
  mfaState: ProviderMfaState;
  factorReference?: string;
};

export type AuthTokenPurpose = "verify-email" | "reset-password";

export type IssuedAuthToken = {
  purpose: AuthTokenPurpose;
  token: string;
  expiresAt: string;
};

export interface AuthProvider {
  readonly provider: "fake" | "supabase";
  registerInvited(
    email: string,
    password: string,
  ): Promise<{
    identity: AuthIdentity;
    verification: IssuedAuthToken | null;
  }>;
  signIn(email: string, password: string): Promise<AuthIdentity>;
  getIdentity(id: string): Promise<AuthIdentity | null>;
  getIdentityByEmail(email: string): Promise<AuthIdentity | null>;
  verifyEmail(token: string): Promise<AuthIdentity>;
  requestPasswordReset(email: string): Promise<IssuedAuthToken | null>;
  resetPassword(token: string, password: string): Promise<AuthIdentity>;
  changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthIdentity>;
  beginMfaEnrollment(id: string): Promise<AuthIdentity>;
  completeMfaEnrollment(id: string, proof: string): Promise<AuthIdentity>;
  beginMfaRecovery(id: string): Promise<AuthIdentity>;
  recoverMfa(id: string, proof: string): Promise<AuthIdentity>;
  removeMfa(id: string, proof: string): Promise<AuthIdentity>;
  challengeMfa(id: string, proof: string): Promise<AuthIdentity>;
  signOutAll(id: string): Promise<number>;
}

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function assertPasswordPolicy(value: string) {
  if (
    value.length < 12 ||
    value.length > 256 ||
    !/[a-z]/.test(value) ||
    !/[A-Z]/.test(value) ||
    !/[0-9]/.test(value)
  )
    throw new Error("PASSWORD_POLICY");
}
