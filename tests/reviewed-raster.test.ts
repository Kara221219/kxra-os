import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
import { reviewRasterAsset } from "../scripts/reviewed-raster.mjs";

const digest = (bytes: Buffer) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
async function raster(format: "png" | "webp" | "avif" = "png") {
  return sharp({
    create: { width: 32, height: 24, channels: 3, background: "#206040" },
  })
    .toFormat(format)
    .toBuffer();
}
const expected = (bytes: Buffer, format = "png") => ({
  format,
  width: 32,
  height: 24,
  sha256: digest(bytes),
});

test("reviewed raster gate fully decodes each supported static export format and records exact bytes/pixels", async () => {
  for (const format of ["png", "webp", "avif"] as const) {
    const bytes = await raster(format);
    const result = await reviewRasterAsset(bytes, expected(bytes, format));
    assert.equal(result.format, format);
    assert.equal(result.bytes, bytes.length);
    assert.equal(result.sha256, digest(bytes));
    assert.match(result.pixelSha256, /^[a-f0-9]{64}$/);
  }
});

test("raster gate rejects substitutions, dimensions and payload limits before acceptance", async () => {
  const bytes = await raster();
  await assert.rejects(
    reviewRasterAsset(bytes, { ...expected(bytes), sha256: "0".repeat(64) }),
    /RASTER_HASH_MISMATCH/,
  );
  await assert.rejects(
    reviewRasterAsset(bytes, { ...expected(bytes), width: 33 }),
    /RASTER_METADATA_REJECTED/,
  );
  await assert.rejects(
    reviewRasterAsset(bytes, { ...expected(bytes), width: 8192 }),
    /RASTER_POLICY_REJECTED/,
  );
  await assert.rejects(
    reviewRasterAsset(Buffer.alloc(10_000_001), expected(bytes)),
    /RASTER_POLICY_REJECTED/,
  );
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>untrusted()</script></svg>',
  );
  await assert.rejects(
    reviewRasterAsset(svg, expected(svg)),
    /RASTER_FORMAT_REJECTED/,
  );
});

test("raster gate rejects trailing payloads, animation/metadata chunks and corrupt image content even with a matching digest", async () => {
  for (const format of ["png", "webp", "avif"] as const) {
    const bytes = Buffer.concat([
      await raster(format),
      Buffer.from("UNTRUSTED_TRAILER"),
    ]);
    await assert.rejects(
      reviewRasterAsset(bytes, expected(bytes, format)),
      /RASTER_(STRUCTURE|FORMAT)_REJECTED/,
    );
  }
  const png = await raster();
  const corrupted = Buffer.from(png);
  const idat = corrupted.indexOf(Buffer.from("IDAT"));
  assert.ok(idat > 0);
  corrupted[idat + 4] ^= 0xff;
  await assert.rejects(reviewRasterAsset(corrupted, expected(corrupted)));
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write("acTL", 4);
  const animated = Buffer.concat([
    png.subarray(0, 33),
    animationChunk,
    png.subarray(33),
  ]);
  await assert.rejects(
    reviewRasterAsset(animated, expected(animated)),
    /RASTER_STRUCTURE_REJECTED/,
  );
  const webpWithMetadata = await sharp(await raster("webp"))
    .withExif({ IFD0: { Copyright: "SYNTHETIC_PRIVATE_METADATA" } })
    .webp()
    .toBuffer();
  await assert.rejects(
    reviewRasterAsset(webpWithMetadata, expected(webpWithMetadata, "webp")),
    /RASTER_STRUCTURE_REJECTED/,
  );
});
