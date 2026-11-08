// Offline source/migration cohort verifier. Does not connect or install anything.
import { assertOwnerOverviewSourceTransition } from "./owner-overview-source-transition.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const repo = path.resolve(import.meta.dirname, ".."),
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
export function sessionAttestationPayload(root = repo) {
  const spec = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "packages/release/custom-app-session-attestation-v1.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    spec.classification,
    "REVIEW_ONLY_ORIGINAL_SESSION_ATTESTATION_NOT_HOSTED_AUTHORIZATION",
  );
  for (const flag of [
    "authorization",
    "defaultEnabled",
    "fullReleaseEligible",
    "numberedMigrationsChanged",
    "hostedExecutorImplemented",
    "existingSessionsBackfilled",
  ])
    assert.equal(spec[flag], false);
  assert.equal(spec.baseCommit, "2b74d665c81893aa100b91b14813e2b40fe9fcfa");
  for (const f of spec.preservedSources)
    assert.equal(
      sha(fs.readFileSync(path.join(root, f.path))),
      f.sha256,
      f.path,
    );
  for (const f of spec.sourceFiles)
    assert.equal(
      sha(fs.readFileSync(path.join(root, f.path))),
      f.sha256,
      f.path,
    );
  const sql = fs.readFileSync(path.join(root, spec.payload.path), "utf8");
  assert.equal(sha(sql), spec.payload.sha256);
  assert.deepEqual(
    [...sql.matchAll(/create table ([\w.]+)\(/g)].map((m) => m[1]).sort(),
    spec.tables,
  );
  assert.deepEqual(
    [...sql.matchAll(/create(?: or replace)? function ([\w.]+)\(/g)]
      .map((m) => m[1])
      .sort(),
    spec.functions,
  );
  return { spec, sql };
}
export function assertSessionAttestationSourceTransition(
  file,
  baseSha,
  root = repo,
) {
  if (assertOwnerOverviewSourceTransition(file, baseSha, root)) return;
  const actual = sha(fs.readFileSync(path.join(root, file)));
  if (actual === baseSha) return;
  const { spec } = sessionAttestationPayload(root);
  const change = spec.transitions.find((t) => t.path === file);
  assert.ok(change, "Unreviewed original-session source transition " + file);
  assert.equal(change.priorSha256, baseSha);
  assert.equal(change.sha256, actual);
}
