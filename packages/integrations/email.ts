import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const emailTemplateKeys = [
  "PARTNER_INVITATION",
  "INVITATION_REMINDER",
  "PASSWORD_RESET",
  "EMAIL_VERIFICATION",
  "WELCOME",
  "SECURITY_ALERT",
  "PROJECT_ASSIGNMENT",
  "ACCESS_REMOVED",
  "APPROVAL_REQUIRED",
] as const;
export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export type RenderEmailInput = {
  template: EmailTemplateKey;
  recipientHint: string;
  expiresAt?: string;
  projectCount?: number;
  projectNames?: string[];
  actionUrl?: string;
  accountState?: string;
};

export type RenderedEmail = {
  template: EmailTemplateKey;
  version: 1;
  subject: string;
  preheader: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );
}

function safeUrl(value?: string) {
  if (!value) return undefined;
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("EMAIL_URL_INVALID");
  return parsed.toString();
}

export function renderEmail(input: RenderEmailInput): RenderedEmail {
  if (!emailTemplateKeys.includes(input.template))
    throw new Error("EMAIL_TEMPLATE_INVALID");
  const actionUrl = safeUrl(input.actionUrl);
  const expiry = input.expiresAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(new Date(input.expiresAt))
    : undefined;
  const projectText = input.projectNames?.length
    ? input.projectNames.join(", ")
    : input.projectCount
      ? `${input.projectCount} assigned project${input.projectCount === 1 ? "" : "s"}`
      : "your assigned KXRA work";
  const copy: Record<EmailTemplateKey, [string, string, string]> = {
    PARTNER_INVITATION: [
      "You’re invited to KXRA",
      "Create your own password to join your assigned KXRA projects.",
      `You have been invited to ${projectText}. KXRA has not created a password for you. Use the secure link to create your own password${expiry ? ` before ${expiry}` : ""}.`,
    ],
    INVITATION_REMINDER: [
      "Your refreshed KXRA invitation",
      "Your earlier invitation link is no longer valid.",
      `A refreshed invitation is ready for ${projectText}. Use this new secure link${expiry ? ` before ${expiry}` : ""}; earlier links will fail.`,
    ],
    PASSWORD_RESET: [
      "Reset your KXRA password",
      "A time-limited password reset was requested.",
      "Use the secure link to choose a new password. If you did not request this, leave the message unused and contact KXRA.",
    ],
    EMAIL_VERIFICATION: [
      "Verify your email for KXRA",
      "Verify the address bound to your KXRA invitation.",
      "Use the secure link to verify this email address. Project access is not activated until verification and onboarding are complete.",
    ],
    WELCOME: [
      "Welcome to KXRA OS",
      "Your KXRA onboarding is complete.",
      `Your account is active for ${projectText}. Sign in to continue in KXRA OS.`,
    ],
    SECURITY_ALERT: [
      "KXRA security alert",
      "A security setting changed on your KXRA account.",
      "Review your account security page. Contact KXRA if you do not recognise the change.",
    ],
    PROJECT_ASSIGNMENT: [
      "Your KXRA project access changed",
      "An owner updated your project assignment.",
      `Your current assignment includes ${projectText}. Sign in to review the effective role and permissions.`,
    ],
    ACCESS_REMOVED: [
      "Your KXRA access changed",
      "Your organisation access is no longer active.",
      `Your KXRA account state is ${input.accountState || "restricted"}. Existing sessions and queued delivery are invalidated. Contact the KXRA owner if this is unexpected.`,
    ],
    APPROVAL_REQUIRED: [
      "KXRA approval required",
      "A controlled action is waiting for owner review.",
      "Open KXRA OS to inspect the exact action, current state, risk and expiry before deciding.",
    ],
  };
  const [subject, preheader, body] = copy[input.template];
  const action = actionUrl ? `\n\nContinue securely: ${actionUrl}` : "";
  const text = `KXRA GROUP · KXRA OS\n\n${body}${action}\n\nRecipient: ${input.recipientHint}\n\nThis message contains no project document content.`;
  const link = actionUrl
    ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#172923;color:#fff;padding:12px 18px;border-radius:5px;text-decoration:none;font-weight:700">Continue securely</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ed;color:#172923;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><main style="max-width:620px;margin:0 auto;padding:40px 24px"><p style="letter-spacing:3px;font-weight:800">KXRA <span style="font-size:12px;font-weight:500">OS</span></p><section style="background:#fff;border:1px solid #d9ded6;border-radius:8px;padding:28px"><h1 style="font-size:28px">${escapeHtml(subject)}</h1><p style="line-height:1.6;color:#52625a">${escapeHtml(body)}</p>${link}<p style="font-size:12px;color:#64726b">Recipient: ${escapeHtml(input.recipientHint)}. This message contains no project document content.</p></section></main></body></html>`;
  return {
    template: input.template,
    version: 1,
    subject,
    preheader,
    text,
    html,
  };
}

export type FakeEmailMessage = RenderedEmail & {
  id: string;
  operationKey: string;
  recipient: string;
  state: "SENT" | "DELIVERY_FAILED" | "BOUNCED" | "CANCELLED";
  attempts: number;
  providerMessageId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type EmailDeliverySecret = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  secretSha256: string;
};

function emailSecretKey(value = process.env.KXRA_EMAIL_SECRET_KEY) {
  if (!value) throw new Error("EMAIL_SECRET_KEY_UNAVAILABLE");
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("EMAIL_SECRET_KEY_INVALID");
  return key;
}

export function sealEmailDeliverySecret(
  secret: string,
  secretSha256: string,
  keyValue?: string,
): EmailDeliverySecret {
  if (!secret || !/^[a-f0-9]{64}$/.test(secretSha256))
    throw new Error("EMAIL_SECRET_INVALID");
  if (digestFull(secret) !== secretSha256)
    throw new Error("EMAIL_SECRET_DIGEST_MISMATCH");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    emailSecretKey(keyValue),
    nonce,
  );
  cipher.setAAD(Buffer.from(`kxra-email-token-v1:${secretSha256}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    secretSha256,
  };
}

export function openEmailDeliverySecret(
  sealed: EmailDeliverySecret,
  keyValue?: string,
) {
  if (!/^[a-f0-9]{64}$/.test(sealed.secretSha256))
    throw new Error("EMAIL_SECRET_INVALID");
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      emailSecretKey(keyValue),
      Buffer.from(sealed.nonce, "base64url"),
    );
    decipher.setAAD(
      Buffer.from(`kxra-email-token-v1:${sealed.secretSha256}`, "utf8"),
    );
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64url"));
    const secret = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    if (digestFull(secret) !== sealed.secretSha256)
      throw new Error("EMAIL_SECRET_DIGEST_MISMATCH");
    return secret;
  } catch (error) {
    if ((error as Error).message === "EMAIL_SECRET_DIGEST_MISMATCH")
      throw error;
    throw new Error("EMAIL_SECRET_DECRYPTION_FAILED");
  }
}

export type EmailTransportResult =
  | { outcome: "ACCEPTED"; providerMessageId: string }
  | {
      outcome: "RETRY" | "PERMANENT" | "AMBIGUOUS";
      errorCode: string;
      retryAfterSeconds?: number;
    };

export class ResendEmailTransport {
  readonly provider = "resend" as const;

  constructor(
    private readonly config: {
      apiKey: string;
      from: string;
      fetch?: typeof fetch;
    },
  ) {
    if (!/^re_[A-Za-z0-9_-]{8,}$/.test(config.apiKey))
      throw new Error("RESEND_API_KEY_INVALID");
    if (!config.from || config.from.length > 320 || /[\r\n]/.test(config.from))
      throw new Error("RESEND_FROM_INVALID");
  }

  async deliver(input: {
    operationKey: string;
    recipient: string;
    rendered: RenderedEmail;
  }): Promise<EmailTransportResult> {
    if (!input.operationKey || input.operationKey.length > 256)
      throw new Error("EMAIL_OPERATION_KEY_INVALID");
    const request = this.config.fetch || fetch;
    let response: Response;
    try {
      response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.operationKey,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [input.recipient],
          subject: input.rendered.subject,
          html: input.rendered.html,
          text: input.rendered.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { outcome: "AMBIGUOUS", errorCode: "RESEND_TRANSPORT_UNKNOWN" };
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const data = (await response.json().catch(() => ({}))) as {
      id?: unknown;
      name?: unknown;
    };
    if (response.ok && typeof data.id === "string" && data.id.length <= 240)
      return { outcome: "ACCEPTED", providerMessageId: data.id };
    const errorCode =
      typeof data.name === "string" && /^[a-z][a-z0-9_]{2,79}$/.test(data.name)
        ? `RESEND_${data.name.toUpperCase()}`
        : `RESEND_HTTP_${response.status}`;
    if (response.status === 429 || response.status >= 500)
      return {
        outcome: "RETRY",
        errorCode,
        retryAfterSeconds:
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(Math.ceil(retryAfter), 3600)
            : 30,
      };
    return { outcome: "PERMANENT", errorCode };
  }
}

export function verifyResendWebhook(input: {
  payload: string;
  id: string;
  timestamp: string;
  signature: string;
  secret?: string;
  nowSeconds?: number;
}) {
  const secretValue = input.secret || process.env.RESEND_WEBHOOK_SECRET;
  if (!secretValue?.startsWith("whsec_"))
    throw new Error("RESEND_WEBHOOK_SECRET_INVALID");
  if (!input.id || !/^\d{10}$/.test(input.timestamp) || !input.signature)
    throw new Error("RESEND_WEBHOOK_SIGNATURE_INVALID");
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300)
    throw new Error("RESEND_WEBHOOK_SIGNATURE_EXPIRED");
  let key: Buffer;
  try {
    key = Buffer.from(secretValue.slice(6), "base64");
  } catch {
    throw new Error("RESEND_WEBHOOK_SECRET_INVALID");
  }
  if (key.length < 16) throw new Error("RESEND_WEBHOOK_SECRET_INVALID");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.payload}`)
    .digest();
  const valid = input.signature
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version, value]) => version === "v1" && value)
    .some(([, value]) => {
      try {
        const actual = Buffer.from(value, "base64");
        return (
          actual.length === expected.length &&
          crypto.timingSafeEqual(actual, expected)
        );
      } catch {
        return false;
      }
    });
  if (!valid) throw new Error("RESEND_WEBHOOK_SIGNATURE_INVALID");
}

type FakeEmailState = { version: 1; messages: FakeEmailMessage[] };

export class FakeEmailTransport {
  readonly provider = "fake" as const;
  private mutation: Promise<unknown> = Promise.resolve();

  constructor(private readonly stateFile: string) {}

  private async read(): Promise<FakeEmailState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.stateFile, "utf8"));
      if (parsed?.version !== 1 || !Array.isArray(parsed.messages))
        throw new Error("FAKE_EMAIL_STATE_INVALID");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { version: 1, messages: [] };
    }
  }

  private async write(state: FakeEmailState) {
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

  async deliver(input: {
    operationKey: string;
    recipient: string;
    rendered: RenderedEmail;
    outcome?: "accepted" | "temporary-failure" | "bounce";
  }) {
    return this.exclusive(async () => {
      const state = await this.read();
      const existing = state.messages.find(
        (message) => message.operationKey === input.operationKey,
      );
      if (existing && existing.state === "SENT") return existing;
      const now = new Date().toISOString();
      const outcome = input.outcome || "accepted";
      const next: FakeEmailMessage = {
        ...input.rendered,
        id: existing?.id || crypto.randomUUID(),
        operationKey: input.operationKey,
        recipient: input.recipient.trim().toLowerCase(),
        state:
          outcome === "accepted"
            ? "SENT"
            : outcome === "bounce"
              ? "BOUNCED"
              : "DELIVERY_FAILED",
        attempts: (existing?.attempts || 0) + 1,
        providerMessageId:
          outcome === "accepted"
            ? `fake-${digestKey(input.operationKey)}`
            : undefined,
        error:
          outcome === "accepted"
            ? undefined
            : outcome === "bounce"
              ? "Synthetic permanent failure"
              : "Synthetic retryable failure",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (existing) state.messages[state.messages.indexOf(existing)] = next;
      else state.messages.push(next);
      await this.write(state);
      return next;
    });
  }

  async cancel(operationKey: string) {
    return this.exclusive(async () => {
      const state = await this.read();
      const message = state.messages.find(
        (item) => item.operationKey === operationKey,
      );
      if (
        !message ||
        message.state === "CANCELLED" ||
        message.state === "SENT" ||
        message.state === "BOUNCED"
      )
        return message || null;
      message.state = "CANCELLED";
      message.updatedAt = new Date().toISOString();
      await this.write(state);
      return message;
    });
  }

  async list(recipient?: string) {
    const state = await this.read();
    const normalized = recipient?.trim().toLowerCase();
    return state.messages
      .filter((message) => !normalized || message.recipient === normalized)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function digestKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function digestFull(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
