import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadSeeds, mapping, validateSeeds } from "./seed.mjs";
import { validateStagingTarget } from "./staging-migrations-core.mjs";

export const canonicalSeedProfile = "KXRA-CANONICAL-SEEDS-V1";

export function canonicalSeedManifest(root) {
  const bundle = loadSeeds(root);
  validateSeeds(bundle);
  const names = ["projects", ...Object.keys(mapping)];
  const files = names.map((name) => {
    const source = fs.readFileSync(
      path.join(root, "KXRA-GENESIS", "registers", `${name}.json`),
    );
    return {
      name: `${name}.json`,
      sha256: crypto.createHash("sha256").update(source).digest("hex"),
    };
  });
  const sha256 = crypto
    .createHash("sha256")
    .update(canonicalSeedProfile)
    .update("\0")
    .update(files.map((file) => `${file.name}:${file.sha256}`).join("\n"))
    .digest("hex");
  const recordCodes = [
    ...bundle.projects.map((project) => `${project.id}-BRIEF`),
    ...Object.keys(mapping).flatMap((name) =>
      bundle[name].map((record) => record.id),
    ),
  ].sort();
  return { profile: canonicalSeedProfile, sha256, files, bundle, recordCodes };
}

export function validateStagingSeeder(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const projectRef = environment.KXRA_STAGING_PROJECT_REF || "";
  if (command === "apply") {
    const expected = `SEED:${projectRef}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_SEED_CONFIRMATION !== expected)
      findings.push(`KXRA_STAGING_SEED_CONFIRMATION must equal ${expected}`);
  }
  return { ok: findings.length === 0, findings };
}

export function reconcileSeedState(manifest, tracked, unmanagedExists) {
  if (!tracked && unmanagedExists)
    throw Error("STAGING_UNMANAGED_CANONICAL_SEED");
  if (tracked && tracked.profile !== manifest.profile)
    throw Error("STAGING_SEED_PROFILE_MISMATCH");
  if (tracked && tracked.sha256 !== manifest.sha256)
    throw Error("STAGING_SEED_HASH_MISMATCH");
  return { applied: Boolean(tracked) };
}
