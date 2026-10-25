import path from "node:path";
import { exportSafeDiagnostics } from "./safe-ci-diagnostics-core.mjs";

// No arguments, arbitrary paths, environment dumps or raw-artifact fallback.
try {
  if (process.argv.length !== 2) throw Error("SAFE_DIAGNOSTICS_REJECTED");
  const root = path.resolve(import.meta.dirname, "..");
  const result = exportSafeDiagnostics({
    root,
    runtime: path.join(root, ".runtime", "ci"),
    destination: path.join(root, "safe-ci-diagnostics-export"),
    environment: process.env,
    metadata: {
      sourceSha: process.env.GITHUB_SHA,
      githubRunId: process.env.GITHUB_RUN_ID,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
    },
  });
  console.log(
    JSON.stringify({
      kind: "SAFE_DIAGNOSTICS_EXPORTED",
      files: result.files,
      bytes: result.bytes,
    }),
  );
} catch {
  console.error("SAFE_DIAGNOSTICS_EXPORT_REJECTED");
  process.exitCode = 1;
}
