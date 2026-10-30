import { z } from "zod";
import type { PaidRefreshQuery } from "./live-paid-refresh-worker";

/** Existing-worker RPC only. Local caching can spend only permits already
 * reserved durably. A fresh process never reloads/refunds unused old permits.
 * Serial admission also makes this safe if a future caller adds parallelism.
 */
export function createSchedulerReadBudget(
  query: PaidRefreshQuery,
  review: string,
  ceiling: number,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
) {
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(review);
  z.number().int().min(1).max(1_000_000_000).parse(ceiling);
  let credits = 0,
    validUntil = 0,
    preceding = Promise.resolve();
  return async () => {
    const before = preceding;
    let release!: () => void;
    preceding = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      if (nowSeconds() >= validUntil) credits = 0;
      if (credits === 0) {
        const result = await query(
          "select kxra_private.reserve_modern_scheduler_reads($1::text,$2::bigint) value",
          [review, ceiling],
        );
        const value = result.rows[0]?.value as
          Record<string, unknown> | undefined;
        if (
          value?.state !== "GRANTED" ||
          value.reserved_reads !== 32 ||
          !Number.isSafeInteger(value.remaining_reads) ||
          Number(value.remaining_reads) < 0 ||
          !Number.isSafeInteger(value.valid_until) ||
          Number(value.valid_until) <= nowSeconds() ||
          Number(value.valid_until) > nowSeconds() + 60
        )
          return false;
        credits = 32;
        validUntil = Number(value.valid_until);
      }
      credits--;
      return true;
    } finally {
      release();
    }
  };
}
