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
