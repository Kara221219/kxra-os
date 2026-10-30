/** Fixed storage: no retained input views and no per-chunk object collection.
 * A million one-byte chunks cannot allocate a million retained objects, and a
 * tiny view cannot keep its provider's arbitrarily large backing buffer alive.
 */
export function billingBodyBuffer(maximumBytes: number) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 1_000_000
  )
    throw Error("BILLING_BODY_BUDGET_INVALID");
  const storage = Buffer.alloc(maximumBytes);
  let length = 0,
    chunks = 0,
    empty = 0;
  return {
    append(value: Uint8Array) {
      if (
        ++chunks > 4096 ||
        (value.byteLength === 0 && ++empty > 64) ||
        value.byteLength > maximumBytes - length
      )
        throw Error("BILLING_BODY_BUDGET_EXCEEDED");
      storage.set(value, length);
      length += value.byteLength;
    },
    finish() {
      const result = Buffer.alloc(length);
      storage.copy(result, 0, 0, length);
      return result;
    },
  };
}
