import {
  execFile,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { codexTextOverrides } from "./codex-text-policy";
import { CodexStdioProtocolAdapter } from "./codex-paired-protocol";
import {
  leasedDraftSchema,
  type LeasedDraft,
  type PairedDraftAdapter,
} from "./paired-runtime";
/** Only an injected local fixture launcher can run. Real installed versions
 * remain refused. Legacy operator path fields are validated, but HOME, config
 * and cwd are always replaced by an owned disposable configuration tree.
 * No installation, sign-in, credential reading or OS policy change occurs. */
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
export function codexProcessPlan(
  config: CodexProcessConfiguration,
  root = "/tmp/kxra-codex-plan-preview",
) {
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
  if (!root.startsWith("/tmp/kxra-codex-") || path.resolve(root) !== root)
    throw Error("CODEX_ISOLATION_PATH_REQUIRED");
  return {
    executable: config.executable,
    args: [
      "app-server",
      "--listen",
      "stdio://",
      ...codexTextOverrides().flatMap((value) => ["-c", value]),
    ],
    options: {
      cwd: path.join(root, "work"),
      env: {
        PATH: "/usr/bin:/bin",
        HOME: path.join(root, "home"),
        CODEX_HOME: path.join(root, "home/.codex"),
        NODE_ENV: "production" as const,
      },
      shell: false as const,
      detached: true as const,
      stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    },
  };
}
export class CodexStdioProcessAdapter implements PairedDraftAdapter {
  readonly kind = "CODEX_STDIO" as const;
  private readonly configuration: CodexProcessConfiguration;
  private readonly launch: SpawnCodex;
  private active = false;
  constructor(config: CodexProcessConfiguration, launch?: SpawnCodex) {
    // No installed CLI/version/capability profile has been accepted. An injected
    // stub launcher is a test boundary, not a real-provider activation flag.
    if (!launch) throw Error("CODEX_INSTALLED_ACCEPTANCE_REQUIRED");
    codexProcessPlan(config);
    this.configuration = structuredClone(config);
    this.launch = launch;
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
    let root: string | undefined;
    let safeToRemove = true;
    try {
      root = fs.mkdtempSync("/tmp/kxra-codex-");
      fs.chmodSync(root, 0o700);
      const plan = codexProcessPlan(this.configuration, root);
      for (const directory of [
        plan.options.cwd,
        plan.options.env.HOME!,
        plan.options.env.CODEX_HOME!,
      ])
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(plan.options.env.CODEX_HOME!, "config.toml"),
        codexTextOverrides()
          .map((line) => line.replace("=", " = "))
          .join("\n") + "\n",
        { mode: 0o600, flag: "wx" },
      );
      child = this.launch(plan.executable, plan.args, plan.options);
      safeToRemove = false;
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
        syntheticProcess: true,
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
          if (shutdownError || (await groupAlive()))
            throw Error("CODEX_GROUP_SHUTDOWN_UNCERTAIN");
          safeToRemove = true;
        },
      }).generate(task, signal);
    } finally {
      this.active = false;
      if (root && safeToRemove)
        fs.rmSync(root, { recursive: true, force: false });
    }
  }
}
