// Owned combined-fixture child only. Never persists custody authorization or key bytes.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireGithubFixture } from "../packages/connectors/github";
import { stopOwnedFixtureChild } from "./owned-fixture-child.mjs";
import { LoopbackSyntheticCustody } from "../packages/connectors/github-custody-synthetic";
export async function startIntegrationCustody(runtime: string) {
  requireGithubFixture();
  assert.ok(
    fs.realpathSync(runtime).startsWith(path.resolve(".runtime") + path.sep),
  );
  const child = fork("scripts/github-custody-fixture.ts", [], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  let recorded = false;
  async function stop() {
    const stopped = await stopOwnedFixtureChild(child, {
      onUncertain: () => {
        fs.writeFileSync(
          path.join(runtime, "integration-process-cleanup-uncertain.json"),
          JSON.stringify({ pid: child.pid, purpose: "custody" }),
          { mode: 0o600 },
        );
      },
    });
    if (!stopped) throw Error("OWNED_CUSTODY_CLEANUP_UNCONFIRMED");
    if (!recorded) {
      fs.appendFileSync(
        path.join(runtime, "integration-custody-processes.jsonl"),
        JSON.stringify({
          pid: child.pid,
          event: "EXIT_CONFIRMED",
          exitCode: child.exitCode,
          signalCode: child.signalCode,
        }) + "\n",
        { mode: 0o600 },
      );
      recorded = true;
    }
  }
  try {
    const ready = await new Promise<{ origin: string; authorization: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          clean();
          reject(Error("OWNED_CUSTODY_START_TIMEOUT"));
        }, 5000);
        const receive = (value: unknown) => {
          if (
            !value ||
            typeof value !== "object" ||
            (value as { type?: unknown }).type !== "ready"
          )
            return;
          clean();
          const v = value as { origin: string; authorization: string };
          resolve(v);
        };
        const fail = () => {
          clean();
          reject(Error("OWNED_CUSTODY_START_FAILED"));
        };
        function clean() {
          clearTimeout(timer);
          child.off("message", receive);
          child.off("exit", fail);
          child.off("error", fail);
        }
        child.on("message", receive);
        child.once("exit", fail);
        child.once("error", fail);
      },
    );
    const client = new LoopbackSyntheticCustody(
      ready.origin,
      ready.authorization,
    );
    return { client, stop, pid: child.pid };
  } catch (e) {
    await stop();
    throw e;
  }
}
