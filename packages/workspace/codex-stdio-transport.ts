import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import path from "node:path";
import { CodexStdioProtocolAdapter } from "./codex-paired-protocol";
import {
  leasedDraftSchema,
  type LeasedDraft,
  type PairedDraftAdapter,
} from "./paired-runtime";
/** Operator-selected paths only, never values from a task/model/HTTP body.
 * No installation, discovery, sign-in or credential reading is performed here.
 * Calling generate launches a process and may incur provider usage: live use
 * requires separate action-specific acceptance. Tests inject an inert spawn. */
export type CodexProcessConfiguration = Readonly<{
  executable: string;
  workingDirectory: string;
  environment: Readonly<{ PATH: string; HOME: string; CODEX_HOME: string }>;
}>;
export type SpawnCodex = (
  executable: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: false;
    detached: true;
    stdio: ["pipe", "pipe", "pipe"];
  },
) => ChildProcessWithoutNullStreams;
export function codexProcessPlan(config: CodexProcessConfiguration) {
  for (const p of [
    config.executable,
    config.workingDirectory,
    config.environment.HOME,
    config.environment.CODEX_HOME,
  ])
    if (!path.isAbsolute(p) || p.includes("\0"))
      throw Error("CODEX_ABSOLUTE_OPERATOR_PATH_REQUIRED");
  if (
    !config.environment.PATH ||
    Object.keys(config.environment).some(
      (k) => !["PATH", "HOME", "CODEX_HOME"].includes(k),
    )
  )
    throw Error("CODEX_ENVIRONMENT_DENIED");
  return {
    executable: config.executable,
    args: ["app-server", "--listen", "stdio://"] as const,
    options: {
      cwd: config.workingDirectory,
      env: { ...config.environment, NODE_ENV: "production" as const },
      shell: false as const,
      detached: true as const,
      stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    },
  };
}
export class CodexStdioProcessAdapter implements PairedDraftAdapter {
  readonly kind = "CODEX_STDIO" as const;
  private readonly plan;
  private active = false;
  constructor(
    config: CodexProcessConfiguration,
    private readonly launch: SpawnCodex = spawn,
  ) {
    this.plan = codexProcessPlan(config);
  }
  async generate(raw: LeasedDraft, signal?: AbortSignal) {
    if (process.platform === "win32")
      throw Error("CODEX_PROCESS_GROUP_UNSUPPORTED");
    const task = leasedDraftSchema.parse(raw);
    signal?.throwIfAborted();
    if (Date.parse(task.lease_until) <= Date.now())
      throw Error("LEASE_EXPIRED");
    if (this.active) throw Error("CODEX_PROCESS_BUSY");
    this.active = true;
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      child = this.launch(
        this.plan.executable,
        this.plan.args,
        this.plan.options,
      );
      const p = child;
      let stderrBytes = 0;
      // Drain but never log provider stderr (may contain source or credentials).
      const onStderr = (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (stderrBytes > 65536) p.stdout.destroy(Error("CODEX_STDERR_LIMIT"));
      };
      p.stderr.on("data", onStderr);
      const onError = () =>
        p.stdout.destroy(Error("CODEX_PROCESS_UNAVAILABLE"));
      p.on("error", onError);
      const exited = new Promise<void>((resolve) =>
        p.once("close", () => {
          resolve();
        }),
      );
      return await new CodexStdioProtocolAdapter({
        input: p.stdin,
        output: p.stdout,
        close: async () => {
          const signalGroup = (signal: NodeJS.Signals) => {
            if (!p.pid) return;
            try {
              process.kill(-p.pid, signal);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
            }
          };
          // Child close/pipe EOF says nothing about descendants that redirect
          // stdio. Observe only group IDs/state (no argv/env/credentials), with
          // a bounded fixed OS utility invocation and no shell.
          const groupAlive = () =>
            new Promise<boolean>((resolve, reject) => {
              execFile(
                "/bin/ps",
                ["-axo", "pgid=,stat="],
                {
                  env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
                  timeout: 500,
                  maxBuffer: 65536,
                },
                (error, stdout) => {
                  if (error) {
                    reject(Error("CODEX_GROUP_STATE_UNCERTAIN"));
                    return;
                  }
                  resolve(
                    stdout.split("\n").some((line) => {
                      const [group, state] = line.trim().split(/\s+/);
                      return Number(group) === p.pid && !state?.startsWith("Z");
                    }),
                  );
                },
              );
            });
          p.stdin.end();
          let shutdownError: unknown;
          try {
            if (await groupAlive()) signalGroup("SIGTERM");
            await new Promise<void>((resolve) => setTimeout(resolve, 250));
            if (await groupAlive()) signalGroup("SIGKILL");
          } catch (e) {
            shutdownError = e;
            // Never report group cleanup as certain. Still stop the direct
            // process whose handle we own when metadata observation fails.
            if (p.exitCode === null && p.signalCode === null) p.kill("SIGKILL");
          }
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              exited,
              new Promise<void>((resolve) => {
                deadline = setTimeout(resolve, 750);
              }),
            ]);
          } finally {
            if (deadline) clearTimeout(deadline);
            p.stdin.destroy();
            p.stdout.destroy();
            p.stderr.destroy();
            p.stderr.off("data", onStderr);
            p.off("error", onError);
          }
          if (shutdownError) throw Error("CODEX_GROUP_SHUTDOWN_UNCERTAIN");
        },
      }).generate(task, signal);
    } finally {
      this.active = false;
    }
  }
}
