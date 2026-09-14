import { z } from "zod";
export const kinds = [
  "idea",
  "assumption",
  "experiment",
  "decision",
  "risk",
  "source",
  "partner",
  "task",
  "approval",
  "finance",
  "knowledge",
  "agent",
  "skill",
  "routine",
  "run",
  "work_log",
  "blocker",
  "note",
] as const;
export const classifications = [
  "FACT",
  "USER-SUPPLIED INFORMATION",
  "EXTERNAL RESEARCH",
  "ASSUMPTION",
  "HYPOTHESIS",
  "ESTIMATE",
  "AI INFERENCE",
  "DECISION",
  "UNRESOLVED QUESTION",
] as const;
export const uuid = z.string().uuid();
export const recordInput = z
  .object({
    kind: z.enum(kinds),
    title: z.string().trim().min(1).max(240),
    body: z.string().max(50000).default(""),
    project_id: uuid.nullable().default(null),
    classification: z.enum(classifications),
    visibility: z.enum(["owner_only", "project_shared"]).default("owner_only"),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "finance") {
      const d = v.data;
      if (
        typeof d.amount !== "string" ||
        !/^\d{1,12}(\.\d{1,4})?$/.test(d.amount)
      )
        ctx.addIssue({
          code: "custom",
          message: "A nonnegative amount with up to four decimals is required",
        });
      if (!["GBP", "USD", "EUR"].includes(String(d.currency)))
        ctx.addIssue({ code: "custom", message: "Choose GBP, USD or EUR" });
      if (
        !["actual", "commitment", "estimate", "paper"].includes(
          String(d.entry_type),
        )
      )
        ctx.addIssue({ code: "custom", message: "Choose an entry type" });
      if (!["income", "expense"].includes(String(d.direction)))
        ctx.addIssue({ code: "custom", message: "Choose income or expense" });
    }
    if (v.kind === "source" && v.data.url) {
      const s = String(v.data.url);
      try {
        if (!["https:", "http:"].includes(new URL(s).protocol)) throw Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Use a public http or https source URL",
        });
      }
    }
  });
export function moneyUnits(amount: string): bigint {
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(amount)) throw Error("Invalid money");
  const [a, b = ""] = amount.split(".");
  return BigInt(a) * 10000n + BigInt(b.padEnd(4, "0"));
}
export function formatMoney(n: bigint) {
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return `${sign}${a / 10000n}.${String(a % 10000n).padStart(4, "0")}`;
}
export function sumFinance(rows: { data: Record<string, unknown> }[]) {
  const sums: Record<string, bigint> = {};
  for (const { data: d } of rows) {
    if (
      d.entry_type !== "actual" ||
      typeof d.amount !== "string" ||
      !["GBP", "USD", "EUR"].includes(String(d.currency))
    )
      continue;
    if (d.direction !== "income" && d.direction !== "expense")
      throw Error("Invalid financial direction");
    const k = String(d.currency);
    const v = moneyUnits(d.amount);
    sums[k] = (sums[k] || 0n) + (d.direction === "expense" ? -v : v);
  }
  return Object.fromEntries(
    Object.entries(sums).map(([k, v]) => [k, formatMoney(v)]),
  );
}
