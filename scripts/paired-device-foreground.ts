/** Explicit foreground bridge. No installer, discovery, key reading, persistence
 * or sign-in. Live --codex-stdio execution needs separate provider acceptance;
 * the acceptance harness exercises --stub-only exclusively. */
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { z } from "zod";
import { PairedDeviceClient } from "../packages/workspace/paired-device-client";
import { CodexStdioProcessAdapter } from "../packages/workspace/codex-stdio-transport";
const mode = process.argv[2];
if (
  (process.argv.length !== 3 &&
    !(
      process.argv.length === 4 &&
      mode === "--stub-only" &&
      process.argv[3] === "--stub-hang"
    )) ||
  !["--stub-only", "--codex-stdio"].includes(mode)
)
  throw Error("EXPLICIT_TRANSPORT_MODE_REQUIRED");
const configuration = z
  .object({
    operation: z.literal("SETUP"),
    origin: z.string().max(200),
    invitation: z.string().regex(/^[a-f0-9]{64}$/),
    executable: z.string().max(1000),
    workingDirectory: z.string().max(1000),
    environment: z
      .object({
        PATH: z.string().max(2000),
        HOME: z.string().max(1000),
        CODEX_HOME: z.string().max(1000),
      })
      .strict(),
  })
  .strict();
const command = z
  .object({ operation: z.enum(["RECONNECT", "RUN_ONCE", "CLOSE"]) })
  .strict();
let client: PairedDeviceClient | undefined,
  adapter: CodexStdioProcessAdapter | undefined;
let inputBytes = 0;
process.stdin.on("data", (bytes) => {
  inputBytes += bytes.length;
  if (inputBytes > 32768) {
    client?.close();
    process.stdin.destroy();
  }
});
const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
const close = () => {
  client?.close();
  input.close();
};
let closing = false;
// CLOSE is an out-of-band local cancellation. It must not wait behind RUN_ONCE.
input.on("line", (line) => {
  if (Buffer.byteLength(line) > 8192) {
    close();
    return;
  }
  try {
    if (command.parse(JSON.parse(line)).operation === "CLOSE" && !closing) {
      closing = true;
      close();
      process.stdout.write(JSON.stringify({ state: "CLOSED" }) + "\n");
    }
  } catch {
    /* Ordinary serialized command parsing below. */
  }
});
process.once("SIGINT", close);
process.once("SIGTERM", close);
const output = (value: object) =>
  process.stdout.write(JSON.stringify(value) + "\n");
async function main() {
  try {
    for await (const line of input) {
      if (closing) break;
      try {
        if (Buffer.byteLength(line) > 8192) throw Error("COMMAND_LIMIT");
        const raw = JSON.parse(line);
        if (!client) {
          const v = configuration.parse(raw);
          // Stub invocations cannot select a different program, home or auth path.
          adapter =
            mode === "--stub-only"
              ? new CodexStdioProcessAdapter(
                  {
                    executable: "/stub/codex",
                    workingDirectory: "/tmp",
                    environment: {
                      PATH: "/usr/bin:/bin",
                      HOME: "/tmp",
                      CODEX_HOME: "/tmp",
                    },
                  },
                  (_e, args, options) =>
                    spawn(
                      process.execPath,
                      [
                        fileURLToPath(
                          new URL(
                            "../tests/support/paired-codex-process.mjs",
                            import.meta.url,
                          ),
                        ),
                        process.argv[3] === "--stub-hang" ? "hang" : "success",
                        ...args,
                      ],
                      options,
                    ),
                )
              : new CodexStdioProcessAdapter(v);
          client = new PairedDeviceClient(v.origin);
          await client.setup(v.invitation);
          output({
            state: client.state,
            transport: mode,
            provider_verified: false,
          });
        } else {
          const v = command.parse(raw);
          if (v.operation === "CLOSE") {
            close();
            output({ state: "CLOSED" });
            break;
          }
          if (v.operation === "RECONNECT") {
            await client.reconnect();
            output({ state: client.state });
          } else
            output({
              receipt: await client.runOnce(adapter!),
              state: client.state,
              provider_verified: false,
            });
        }
      } catch {
        output({
          error: "PAIRED_FOREGROUND_OPERATION_FAILED",
          state: client?.state ?? "UNPAIRED",
        });
      }
    }
  } finally {
    close();
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
  }
}
main().catch(() => {
  process.exitCode = 1;
});
