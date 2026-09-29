import crypto from "node:crypto";

const secretPattern = /^[A-Za-z0-9_-]{64,128}$/;

export function validWorkerTriggerSecret(value: string | undefined) {
  return secretPattern.test(value || "");
}

export function authorizeWorkerRequest(
  request: Request,
  configuredSecret = process.env.KXRA_EMAIL_WORKER_TRIGGER_SECRET,
) {
  if (!validWorkerTriggerSecret(configuredSecret))
    throw Error("EMAIL_WORKER_TRIGGER_SECRET_INVALID");
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{64,128})$/.exec(authorization);
  if (!match) return false;
  const actual = crypto.createHash("sha256").update(match[1]).digest();
  const expected = crypto
    .createHash("sha256")
    .update(configuredSecret as string)
    .digest();
  return crypto.timingSafeEqual(actual, expected);
}
