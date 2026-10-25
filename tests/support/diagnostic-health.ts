import { localModeConfiguration } from "../../packages/authz/local-guard";

export async function diagnosticHealth(
  environment: NodeJS.ProcessEnv,
  transport: typeof fetch = globalThis.fetch,
) {
  const reject = () => {
    throw Error("SAFE_DIAGNOSTIC_HEALTH_REJECTED");
  };
  if (
    environment.KXRA_SAFE_DIAGNOSTICS_ENABLED !== "true" ||
    !localModeConfiguration(environment) ||
    environment.VERCEL_ENV ||
    environment.GITHUB_ACTIONS !== "true" ||
    !/^[a-f0-9]{40}$/.test(environment.GITHUB_SHA || "") ||
    !/^[1-9][0-9]{0,19}$/.test(environment.GITHUB_RUN_ID || "") ||
    !/^[1-9][0-9]{0,5}$/.test(environment.GITHUB_RUN_ATTEMPT || "") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      environment.KXRA_CI_RUN_ID || "",
    )
  )
    return reject();
  try {
    const response = await transport(
      new URL("/api/health", environment.KXRA_ORIGIN),
      {
        redirect: "error",
        signal: AbortSignal.timeout(1200),
      },
    );
    if (response.status !== 200 || !response.body) return reject();
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        return reject();
      }
      chunks.push(next.value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "run_id,service" ||
      value.service !== "kxra-os" ||
      value.run_id !== environment.KXRA_CI_RUN_ID
    )
      return reject();
    return value as { service: "kxra-os"; run_id: string };
  } catch {
    return reject();
  }
}
