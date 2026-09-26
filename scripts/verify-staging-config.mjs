import { verifyStagingConfiguration } from "./staging-config.mjs";

const kind = process.argv[2];
const result = verifyStagingConfiguration(kind, process.env);
if (!result.ok) {
  console.error(`Staging ${kind || "configuration"} preflight FAILED:`);
  for (const finding of result.findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    `Staging ${kind} preflight PASS (${Object.keys(process.env).length} variables inspected; values not printed).`,
  );
}
