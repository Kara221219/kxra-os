import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertPasswordPolicy,
  normalizeAuthEmail,
  type AuthIdentity,
  type AuthProvider,
  type IssuedAuthToken,
  type ProviderMfaState,
} from "./provider";

const scrypt = promisify(crypto.scrypt);

type StoredUser = {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  emailVerified: boolean;
  providerSessionVersion: number;
  mfaState: ProviderMfaState;
  factorReference?: string;
  verificationDigest?: string;
  verificationExpiresAt?: string;
  resetDigest?: string;
  resetExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ProviderState = { version: 1; users: Record<string, StoredUser> };

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicUserId(email: string) {
  const bytes = crypto
    .createHash("sha256")
    .update(`kxra-local-auth:${email}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function publicIdentity(user: StoredUser, aal: "aal1" | "aal2" = "aal1") {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    aal,
    providerSessionVersion: user.providerSessionVersion,
    mfaState: user.mfaState,
    factorReference: user.factorReference,
  } satisfies AuthIdentity;
}

function token(expiresInMs: number, purpose: IssuedAuthToken["purpose"]) {
  return {
    purpose,
    token: crypto.randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  } satisfies IssuedAuthToken;
}

export class FakeAuthProvider implements AuthProvider {
  readonly provider = "fake" as const;
  private mutation: Promise<unknown> = Promise.resolve();

  constructor(private readonly stateFile: string) {}

  private async read(): Promise<ProviderState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.stateFile, "utf8"));
      if (parsed?.version !== 1 || typeof parsed.users !== "object")
        throw new Error("FAKE_AUTH_STATE_INVALID");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { version: 1, users: {} };
    }
  }

  private async write(state: ProviderState) {
    await fs.mkdir(path.dirname(this.stateFile), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${this.stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
    await fs.rename(temporary, this.stateFile);
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(work, work);
    this.mutation = next.catch(() => undefined);
    return next;
  }

  private async password(value: string, salt?: string) {
    assertPasswordPolicy(value);
    const actualSalt = salt || crypto.randomBytes(16).toString("hex");
    const output = (await scrypt(value, actualSalt, 64)) as Buffer;
    return { salt: actualSalt, hash: output.toString("hex") };
  }

  private async matches(value: string, user: StoredUser) {
    try {
      const candidate = await this.password(value, user.passwordSalt);
      return crypto.timingSafeEqual(
        Buffer.from(candidate.hash, "hex"),
        Buffer.from(user.passwordHash, "hex"),
      );
    } catch {
      return false;
    }
  }

  async registerInvited(emailValue: string, passwordValue: string) {
    return this.exclusive(async () => {
      const email = normalizeAuthEmail(emailValue);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("REGISTRATION_UNAVAILABLE");
      const state = await this.read();
      const existing = state.users[email];
      if (existing) {
        if (
          existing.emailVerified ||
          !(await this.matches(passwordValue, existing))
        )
          throw new Error("ACCOUNT_EXISTS");
        const verification = token(60 * 60_000, "verify-email");
        existing.verificationDigest = digest(verification.token);
        existing.verificationExpiresAt = verification.expiresAt;
        existing.updatedAt = new Date().toISOString();
        await this.write(state);
        return { identity: publicIdentity(existing), verification };
      }
      const password = await this.password(passwordValue);
      const verification = token(60 * 60_000, "verify-email");
      const now = new Date().toISOString();
      const user: StoredUser = {
        id: deterministicUserId(email),
        email,
        passwordSalt: password.salt,
        passwordHash: password.hash,
        emailVerified: false,
        providerSessionVersion: 1,
        mfaState: "NOT_ENROLLED",
        verificationDigest: digest(verification.token),
        verificationExpiresAt: verification.expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      state.users[email] = user;
      await this.write(state);
      return { identity: publicIdentity(user), verification };
    });
  }

  async signIn(emailValue: string, passwordValue: string) {
    const email = normalizeAuthEmail(emailValue);
    const state = await this.read();
    const user = state.users[email];
    if (!user || !(await this.matches(passwordValue, user)))
      throw new Error("SIGN_IN_UNAVAILABLE");
    return publicIdentity(user);
  }

  async getIdentity(id: string) {
    const state = await this.read();
    const user = Object.values(state.users).find(
      (candidate) => candidate.id === id,
    );
    return user ? publicIdentity(user) : null;
  }

  async getIdentityByEmail(emailValue: string) {
    const state = await this.read();
    const user = state.users[normalizeAuthEmail(emailValue)];
    return user ? publicIdentity(user) : null;
  }

  async verifyEmail(rawToken: string) {
    return this.exclusive(async () => {
      const state = await this.read();
      const expected = digest(rawToken);
      const user = Object.values(state.users).find(
        (candidate) => candidate.verificationDigest === expected,
      );
      if (
        !user ||
        !user.verificationExpiresAt ||
        new Date(user.verificationExpiresAt).getTime() <= Date.now()
      )
        throw new Error("VERIFICATION_UNAVAILABLE");
      user.emailVerified = true;
      delete user.verificationDigest;
      delete user.verificationExpiresAt;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return publicIdentity(user);
    });
  }

  async requestPasswordReset(emailValue: string) {
    return this.exclusive(async () => {
      const state = await this.read();
      const user = state.users[normalizeAuthEmail(emailValue)];
      if (!user) return null;
      const reset = token(30 * 60_000, "reset-password");
      user.resetDigest = digest(reset.token);
      user.resetExpiresAt = reset.expiresAt;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return reset;
    });
  }

  async resetPassword(rawToken: string, newPassword: string) {
    return this.exclusive(async () => {
      const state = await this.read();
      const expected = digest(rawToken);
      const user = Object.values(state.users).find(
        (candidate) => candidate.resetDigest === expected,
      );
      if (
        !user ||
        !user.resetExpiresAt ||
        new Date(user.resetExpiresAt).getTime() <= Date.now()
      )
        throw new Error("RESET_UNAVAILABLE");
      const password = await this.password(newPassword);
      user.passwordSalt = password.salt;
      user.passwordHash = password.hash;
      user.providerSessionVersion += 1;
      delete user.resetDigest;
      delete user.resetExpiresAt;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return publicIdentity(user);
    });
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ) {
    return this.exclusive(async () => {
      const state = await this.read();
      const user = Object.values(state.users).find(
        (candidate) => candidate.id === id,
      );
      if (!user || !(await this.matches(currentPassword, user)))
        throw new Error("PASSWORD_CHANGE_UNAVAILABLE");
      const password = await this.password(newPassword);
      user.passwordSalt = password.salt;
      user.passwordHash = password.hash;
      user.providerSessionVersion += 1;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return publicIdentity(user);
    });
  }

  async beginMfaEnrollment(id: string) {
    return this.setMfa(id, "ENROLLING", {
      factorReference: null,
      allowedFrom: ["NOT_ENROLLED"],
    });
  }

  async completeMfaEnrollment(id: string, proof: string) {
    if (proof !== "KXRA-LOCAL-MFA") throw new Error("MFA_PROOF_UNAVAILABLE");
    return this.setMfa(id, "ENROLLED", {
      factorReference: "fake-factor-v1",
      aal: "aal2",
      allowedFrom: ["ENROLLING"],
    });
  }

  async beginMfaRecovery(id: string) {
    return this.setMfa(id, "RECOVERY_REQUIRED", {
      allowedFrom: ["ENROLLED"],
    });
  }

  async recoverMfa(id: string, proof: string) {
    if (proof !== "KXRA-LOCAL-RECOVERY")
      throw new Error("MFA_PROOF_UNAVAILABLE");
    return this.setMfa(id, "ENROLLED", {
      aal: "aal2",
      allowedFrom: ["RECOVERY_REQUIRED"],
    });
  }

  async removeMfa(id: string, proof: string) {
    if (proof !== "KXRA-LOCAL-MFA") throw new Error("MFA_PROOF_UNAVAILABLE");
    return this.setMfa(id, "NOT_ENROLLED", {
      factorReference: null,
      allowedFrom: ["ENROLLED"],
    });
  }

  async challengeMfa(id: string, proof: string) {
    const identity = await this.getIdentity(id);
    if (
      !identity ||
      identity.mfaState !== "ENROLLED" ||
      proof !== "KXRA-LOCAL-MFA"
    )
      throw new Error("MFA_PROOF_UNAVAILABLE");
    return { ...identity, aal: "aal2" as const };
  }

  private setMfa(
    id: string,
    mfaState: ProviderMfaState,
    options: {
      factorReference?: string | null;
      aal?: "aal1" | "aal2";
      allowedFrom: ProviderMfaState[];
    },
  ) {
    return this.exclusive(async () => {
      const state = await this.read();
      const user = Object.values(state.users).find(
        (candidate) => candidate.id === id,
      );
      if (!user || !options.allowedFrom.includes(user.mfaState))
        throw new Error("MFA_UPDATE_UNAVAILABLE");
      user.mfaState = mfaState;
      if (options.factorReference === null) delete user.factorReference;
      else if (options.factorReference !== undefined)
        user.factorReference = options.factorReference;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return publicIdentity(user, options.aal);
    });
  }

  async signOutAll(id: string) {
    return this.exclusive(async () => {
      const state = await this.read();
      const user = Object.values(state.users).find(
        (candidate) => candidate.id === id,
      );
      if (!user) throw new Error("SESSION_REVOCATION_UNAVAILABLE");
      user.providerSessionVersion += 1;
      user.updatedAt = new Date().toISOString();
      await this.write(state);
      return user.providerSessionVersion;
    });
  }
}
