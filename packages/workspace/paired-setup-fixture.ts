import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { localModeConfiguration } from "../authz/local-guard";
import type { Principal } from "../db";
const valid = new WeakSet<object>(),
  brand = Symbol("pairedSetupFixture");
export type PairedSetupFixtureBoundary = Readonly<{
  runtime: string;
  [brand]: true;
}>;
export function isPairedSetupFixtureBoundary(
  v: unknown,
): v is PairedSetupFixtureBoundary {
  return !!v && typeof v === "object" && valid.has(v);
}
/** Test-only capability: no hosted or general fixture store, no caller DTO can mint it. */
export function pairedSetupFixtureBoundary(
  env: NodeJS.ProcessEnv = process.env,
): PairedSetupFixtureBoundary {
  const fail = () => {
    throw Error("PAIRED_SETUP_FIXTURE_REQUIRED");
  };
  if (
    !localModeConfiguration(env) ||
    env.KXRA_PAIRED_SETUP_UI_PROOF !== "1" ||
    env.VERCEL_ENV ||
    Object.keys(env).some(
      (k) => /^(SUPABASE_|NEXT_PUBLIC_SUPABASE_)/.test(k) && env[k],
    )
  )
    return fail();
  const runtime = fs.realpathSync(env.KXRA_RUNTIME!);
  if (
    !/^\/(?:private\/)?tmp\/kxra-pas-[A-Za-z0-9]+\/\.runtime\/pas$/.test(
      runtime,
    )
  )
    return fail();
  for (const p of [runtime, path.join(runtime, "socket")]) {
    const meta = fs.lstatSync(p);
    if (
      !meta.isDirectory() ||
      meta.isSymbolicLink() ||
      meta.uid !== process.getuid?.() ||
      (meta.mode & 0o077) !== 0
    )
      return fail();
  }
  const file = path.join(runtime, "database.json"),
    meta = fs.lstatSync(file);
  if (
    !meta.isFile() ||
    meta.isSymbolicLink() ||
    meta.uid !== process.getuid?.() ||
    (meta.mode & 0o077) !== 0
  )
    return fail();
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    cfg.host !== path.join(runtime, "socket") ||
    fs.realpathSync(cfg.host) !== cfg.host ||
    cfg.user !== "kxra_app" ||
    cfg.database !== "postgres" ||
    cfg.password ||
    cfg.connectionString ||
    cfg.ssl
  )
    return fail();
  const value = Object.freeze({ runtime, [brand]: true as const });
  valid.add(value);
  return value;
}
const claims = z
  .object({
    purpose: z.literal("PAIRED_SETUP_UI_FIXTURE_V1"),
    id: z.uuid(),
    organisation_id: z.uuid(),
    session_version: z.number().int().positive(),
    aal: z.enum(["aal1", "aal2"]),
    auth_time: z.number().int().positive(),
    issued_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export const pairedSetupFixtureCookie = "kxra_paired_setup_fixture";
export function signPairedSetupFixture(
  actor: Principal,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
) {
  pairedSetupFixtureBoundary(env);
  const issued_at = Math.floor(now / 1000);
  const data = claims.parse({
    purpose: "PAIRED_SETUP_UI_FIXTURE_V1",
    id: actor.id,
    organisation_id: actor.organisation_id,
    session_version: actor.session_version,
    aal: actor.aal,
    auth_time: actor.auth_time,
    issued_at,
    expires_at: issued_at + 600,
  });
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return (
    payload +
    "." +
    crypto
      .createHmac("sha256", env.KXRA_LOCAL_SECRET!)
      .update(payload)
      .digest("base64url")
  );
}
export function pairedSetupFixtureIdentity(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Principal | null {
  pairedSetupFixtureBoundary(env);
  const cookie = request.headers.get("cookie") ?? "";
  if (cookie.length > 4096) return null;
  const values = cookie
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(pairedSetupFixtureCookie + "="));
  if (values.length !== 1) return null;
  const token = values[0].slice(pairedSetupFixtureCookie.length + 1);
  if (token.length > 2048) return null;
  try {
    const pieces = token.split(".");
    if (pieces.length !== 2 || !pieces.every((v) => /^[A-Za-z0-9_-]+$/.test(v)))
      return null;
    const expected = crypto
        .createHmac("sha256", env.KXRA_LOCAL_SECRET!)
        .update(pieces[0])
        .digest(),
      supplied = Buffer.from(pieces[1], "base64url");
    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    )
      return null;
    const value = claims.parse(
        JSON.parse(Buffer.from(pieces[0], "base64url").toString("utf8")),
      ),
      seconds = Math.floor(now / 1000);
    if (
      value.issued_at > seconds + 60 ||
      value.expires_at <= seconds ||
      value.expires_at > value.issued_at + 600
    )
      return null;
    return Object.freeze({
      id: value.id,
      organisation_id: value.organisation_id,
      session_version: value.session_version,
      aal: value.aal,
      auth_time: value.auth_time,
      source: "fixture" as const,
    });
  } catch {
    return null;
  }
}
