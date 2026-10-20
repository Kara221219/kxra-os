import crypto from "node:crypto";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
export const providers = [
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "OPENROUTER",
  "COMPATIBLE",
  "FIXTURE",
] as const;
export type Provider = (typeof providers)[number];
export const connectionInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    provider: z.enum(providers),
    model: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-zA-Z0-9._:/-]+$/),
    endpoint_id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{0,80}$/)
      .default(""),
    key: z.string().min(1).max(8000),
  })
  .strict();
export type Connection = {
  id: string;
  org_id: string;
  provider: Provider;
  model: string;
  endpoint_id: string;
  encrypted_key: string;
};
function vaultKey() {
  const raw = process.env.KXRA_MODEL_VAULT_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw Error("VAULT_NOT_CONFIGURED");
  return Buffer.from(raw, "hex");
}
export function sealKey(key: string, scope: string) {
  const nonce = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), nonce);
  cipher.setAAD(Buffer.from(scope));
  const value = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), value]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function openKey(value: string, scope: string) {
  const [nonce, tag, data] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), nonce);
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
export function endpoint(
  c: Pick<Connection, "provider" | "endpoint_id" | "model">,
): URL {
  const fixed: Partial<Record<Provider, string>> = {
    OPENAI: "https://api.openai.com/v1/chat/completions",
    ANTHROPIC: "https://api.anthropic.com/v1/messages",
    GOOGLE: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`,
    OPENROUTER: "https://openrouter.ai/api/v1/chat/completions",
  };
  const raw =
    c.provider === "COMPATIBLE"
      ? JSON.parse(process.env.KXRA_MODEL_ENDPOINTS || "{}")[c.endpoint_id]
      : fixed[c.provider];
  if (typeof raw !== "string") throw Error("ENDPOINT_NOT_CONFIGURED");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== "443") ||
    net.isIP(url.hostname)
  )
    throw Error("ENDPOINT_REJECTED");
  return url;
}
const denied = new net.BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  denied.addSubnet(ip, prefix);
export function publicIpv4(address: string) {
  return net.isIPv4(address) && !denied.check(address);
}
export type Transport = (
  url: URL,
  headers: Record<string, string>,
  body: unknown,
) => Promise<unknown>;
export async function resolveProviderAddress(
  hostname: string,
  lookup: (hostname: string) => Promise<{ address: string }[]> = (host) =>
    dns.lookup(host, { all: true, family: 4 }),
  timeoutMs = 5000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("PROVIDER_TIMEOUT")), timeoutMs);
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicIpv4(a.address)))
      throw Error("ENDPOINT_REJECTED");
    return addresses[0].address;
  } catch (error) {
    if (
      error instanceof Error &&
      ["ENDPOINT_REJECTED", "PROVIDER_TIMEOUT"].includes(error.message)
    )
      throw error;
    throw Error("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}
export const secureTransport: Transport = async (url, headers, body) => {
  // Pin the validated DNS answer to this socket. No redirects, proxies or localhost endpoints.
  const address = await resolveProviderAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        lookup: (_host, _options, cb) => cb(null, address, 4),
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          response.resume();
          reject(
            Error(
              response.statusCode === 429
                ? "PROVIDER_RATE_LIMIT"
                : "PROVIDER_REJECTED",
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 262144) {
            response.destroy();
            reject(Error("PROVIDER_RESPONSE_TOO_LARGE"));
          } else chunks.push(chunk);
        });
        response.on("error", () => reject(Error("PROVIDER_UNAVAILABLE")));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(Error("PROVIDER_INVALID_RESPONSE"));
          }
        });
      },
    );
    const timer = setTimeout(() => {
      request.destroy();
      reject(Error("PROVIDER_TIMEOUT"));
    }, 25000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", () => reject(Error("PROVIDER_UNAVAILABLE")));
    request.end(JSON.stringify(body));
  });
};
export async function generate(
  c: Connection,
  system: string,
  context: string,
  transport: Transport = secureTransport,
) {
  const key = openKey(c.encrypted_key, `${c.org_id}:${c.id}`),
    url = endpoint(c);
  const headers: Record<string, string> = {},
    textRequest = {
      model: c.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: context },
      ],
      max_completion_tokens: 1200,
    };
  let body: unknown = textRequest;
  if (c.provider === "ANTHROPIC") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: c.model,
      system,
      messages: [{ role: "user", content: context }],
      max_tokens: 1200,
    };
  } else if (c.provider === "GOOGLE") {
    headers["x-goog-api-key"] = key;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: context }] }],
      generationConfig: { maxOutputTokens: 1200 },
    };
  } else {
    headers.authorization = `Bearer ${key}`;
    if (c.provider !== "OPENAI")
      body = {
        model: c.model,
        messages: textRequest.messages,
        max_tokens: 1200,
      };
  }
  const raw = await transport(url, headers, body);
  // Provider content is untrusted text, never executable HTML, permissions or tool calls.
  const count = z.number().int().min(0).max(10000000).optional().default(0);
  let output: string,
    input_tokens = 0,
    output_tokens = 0;
  if (c.provider === "ANTHROPIC") {
    const v = z
      .object({
        stop_reason: z.string(),
        content: z.array(
          z.object({ type: z.string(), text: z.string().optional() }),
        ),
        usage: z
          .object({ input_tokens: count, output_tokens: count })
          .optional(),
      })
      .parse(raw);
    if (v.stop_reason !== "end_turn") throw Error("PROVIDER_INCOMPLETE");
    output = v.content
      .filter((x) => x.type === "text")
      .map((x) => x.text || "")
      .join("\n");
    input_tokens = v.usage?.input_tokens || 0;
    output_tokens = v.usage?.output_tokens || 0;
  } else if (c.provider === "GOOGLE") {
    const v = z
      .object({
        candidates: z.array(
          z.object({
            finishReason: z.string(),
            content: z.object({
              parts: z.array(z.object({ text: z.string().optional() })),
            }),
          }),
        ),
        usageMetadata: z
          .object({ promptTokenCount: count, candidatesTokenCount: count })
          .optional(),
      })
      .parse(raw);
    if (v.candidates[0]?.finishReason !== "STOP")
      throw Error("PROVIDER_INCOMPLETE");
    output = v.candidates[0].content.parts.map((x) => x.text || "").join("\n");
    input_tokens = v.usageMetadata?.promptTokenCount || 0;
    output_tokens = v.usageMetadata?.candidatesTokenCount || 0;
  } else {
    const v = z
      .object({
        choices: z.array(
          z.object({
            finish_reason: z.string(),
            message: z.object({
              content: z.string().nullable(),
              refusal: z.string().nullable().optional(),
            }),
          }),
        ),
        usage: z
          .object({ prompt_tokens: count, completion_tokens: count })
          .optional(),
      })
      .parse(raw);
    if (v.choices[0]?.finish_reason !== "stop" || v.choices[0].message.refusal)
      throw Error("PROVIDER_INCOMPLETE");
    output = v.choices[0].message.content || "";
    input_tokens = v.usage?.prompt_tokens || 0;
    output_tokens = v.usage?.completion_tokens || 0;
  }
  if (!output.trim() || output.length > 12000)
    throw Error("PROVIDER_INVALID_RESPONSE");
  return { output, input_tokens, output_tokens };
}
