import assert from "node:assert/strict";
import test from "node:test";
import { billingBodyBuffer } from "../packages/integrations/billing-body-buffer";
test("tiny chunks hit the count budget while the byte budget still has room", () => {
  const b = billingBodyBuffer(1_000_000);
  for (let i = 0; i < 4096; i++) b.append(new Uint8Array([97]));
  assert.throws(() => b.append(new Uint8Array([97])), /BUDGET_EXCEEDED/);
  assert.equal(b.finish().byteLength, 4096);
});
test("small views of large backing buffers are copied immediately into exact owned output", () => {
  const large = new Uint8Array(16_000_000),
    b = billingBodyBuffer(100_000);
  large.set([65, 66, 67], 8_000_000);
  b.append(large.subarray(8_000_000, 8_000_003));
  large.fill(90); // Subsequent producer mutation cannot alter signed/parsed bytes.
  const bytes = b.finish();
  assert.equal(bytes.toString(), "ABC");
  assert.equal(bytes.buffer.byteLength, 3);
});
test("byte boundary and total empty-read bounds remain fail closed", () => {
  const b = billingBodyBuffer(3);
  for (let i = 0; i < 64; i++) b.append(new Uint8Array());
  b.append(new Uint8Array([1, 2, 3]));
  assert.deepEqual([...b.finish()], [1, 2, 3]);
  assert.throws(() => b.append(new Uint8Array()), /BUDGET_EXCEEDED/);
  assert.throws(() => b.append(new Uint8Array([4])), /BUDGET_EXCEEDED/);
});
