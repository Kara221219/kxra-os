import { z } from "zod";
export const leasedDraftSchema = z
  .object({
    id: z.uuid(),
    agent_id: z.uuid(),
    room_id: z.uuid(),
    thread_id: z.uuid(),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    fence: z.uuid(),
    lease_until: z.string().datetime({ offset: true }),
    objective: z.string().max(2000),
    sources: z
      .array(
        z
          .object({
            id: z.uuid(),
            body: z.string().max(12000),
            thread: z.uuid(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type LeasedDraft = z.infer<typeof leasedDraftSchema>;
export interface PairedDraftAdapter {
  readonly kind: "SYNTHETIC" | "CODEX_PROTOCOL_FIXTURE" | "CODEX_STDIO";
  generate(task: LeasedDraft, signal?: AbortSignal): Promise<string>;
}
export const boundedDraft = z
  .string()
  .trim()
  .min(1)
  .max(10000)
  .refine((s) => Buffer.byteLength(s, "utf8") <= 20000);
export class SyntheticPairedAdapter implements PairedDraftAdapter {
  readonly kind = "SYNTHETIC" as const;
  async generate(task: LeasedDraft) {
    leasedDraftSchema.parse(task);
    return boundedDraft.parse(
      `Synthetic paired draft: ${task.objective}. Review the quoted room evidence before taking action.`,
    );
  }
}
export type DeviceTransport = (
  op: "POLL" | "START" | "RESULT" | "ABANDON",
  payload: unknown,
) => Promise<Record<string, unknown>>;
/** One explicit cycle. Transport/process failure never replays generation. */
export async function runPairedCycle(
  transport: DeviceTransport,
  adapter: PairedDraftAdapter,
  requestId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const polled = await transport("POLL", {
    request_id: z.uuid().parse(requestId),
  });
  if (!polled.task) return { state: "IDLE" as const };
  const task = leasedDraftSchema.parse(polled.task);
  let started = false;
  try {
    if (Date.parse(task.lease_until) <= Date.now())
      throw Error("LEASE_EXPIRED");
    signal?.throwIfAborted();
    const result = await transport("START", {
      task_id: task.id,
      fence: task.fence,
    });
    if (result.state === "RUNNING" && result.dispatched === false)
      return { state: "ALREADY_DISPATCHED" as const, replayed: false };
    if (result.state !== "RUNNING" || result.dispatched !== true)
      throw Error("DISPATCH_UNAVAILABLE");
    started = true;
    const draft = boundedDraft.parse(await adapter.generate(task, signal));
    signal?.throwIfAborted();
    const saved = await transport("RESULT", {
      task_id: task.id,
      fence: task.fence,
      draft_text: draft,
    });
    if (saved.state !== "DONE") throw Error("RESULT_WITHHELD");
    return { state: "DONE" as const, message_id: saved.message_id };
  } catch {
    try {
      await transport("ABANDON", { task_id: task.id, fence: task.fence });
    } catch {
      /* Offline/revoked: lease expiry fences the result. */
    }
    return {
      state: "UNCERTAIN" as const,
      dispatched: started,
      replayed: false,
    };
  }
}
