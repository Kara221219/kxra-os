import crypto from "node:crypto";
import { createRequire } from "node:module";

// Offline operator check using Next's existing lockfile-resolved sharp package.
// Missing optional/native decoder support must fail this check, never skip it.
const sharp = createRequire(import.meta.url)("sharp");
const maximumBytes = 10_000_000;
const maximumPixels = 16_000_000;

function framing(bytes, format) {
  if (format === "png") {
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
      throw Error("RASTER_FORMAT_REJECTED");
    let offset = 8;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (
        !["IHDR", "PLTE", "tRNS", "pHYs", "IDAT", "IEND"].includes(type) ||
        (type === "pHYs" && size !== 9) ||
        (offset === 8 && type !== "IHDR") ||
        offset + size + 12 > bytes.length
      )
        throw Error("RASTER_STRUCTURE_REJECTED");
      offset += size + 12;
      if (type === "IEND") {
        ended = size === 0;
        break;
      }
    }
    if (!ended || offset !== bytes.length)
      throw Error("RASTER_STRUCTURE_REJECTED");
  } else if (format === "webp") {
    if (
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" ||
      bytes.readUInt32LE(4) + 8 !== bytes.length
    )
      throw Error("RASTER_FORMAT_REJECTED");
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      if (!["VP8 ", "VP8L", "VP8X", "ALPH"].includes(type))
        throw Error("RASTER_STRUCTURE_REJECTED");
      offset += 8 + size + (size % 2);
    }
    if (offset !== bytes.length) throw Error("RASTER_STRUCTURE_REJECTED");
  } else if (format === "avif") {
    let offset = 0;
    while (offset + 8 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (
        size < 8 ||
        offset + size > bytes.length ||
        !["ftyp", "meta", "mdat"].includes(type) ||
        (offset === 0 && type !== "ftyp")
      )
        throw Error("RASTER_STRUCTURE_REJECTED");
      if (type === "ftyp") {
        const brands = [];
        for (let i = offset + 8; i + 4 <= offset + size; i += 4)
          brands.push(bytes.toString("ascii", i, i + 4));
        if (!brands.includes("avif") || brands.includes("avis"))
          throw Error("RASTER_FORMAT_REJECTED");
      }
      offset += size;
    }
    if (offset !== bytes.length) throw Error("RASTER_STRUCTURE_REJECTED");
  } else throw Error("RASTER_FORMAT_REJECTED");
}

// An exact-byte approval check for offline static exports, not an upload API,
// sanitizer, malware scanner, decoder sandbox or video approval mechanism.
export async function reviewRasterAsset(bytes, expected) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 12 ||
    bytes.length > maximumBytes ||
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected.sha256 || "") ||
    !Number.isSafeInteger(expected.width) ||
    expected.width < 1 ||
    expected.width > 4096 ||
    !Number.isSafeInteger(expected.height) ||
    expected.height < 1 ||
    expected.height > 4096 ||
    expected.width * expected.height > maximumPixels
  )
    throw Error("RASTER_POLICY_REJECTED");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expected.sha256) throw Error("RASTER_HASH_MISMATCH");
  framing(bytes, expected.format);
  const image = sharp(bytes, {
    limitInputPixels: maximumPixels,
    failOn: "warning",
    animated: true,
  }).timeout({ seconds: 10 });
  const metadata = await image.metadata();
  const format =
    metadata.format === "heif" && metadata.compression === "av1"
      ? "avif"
      : metadata.format;
  if (
    format !== expected.format ||
    metadata.width !== expected.width ||
    metadata.height !== expected.height ||
    (metadata.pages || 1) !== 1 ||
    metadata.exif ||
    metadata.icc ||
    metadata.iptc ||
    metadata.xmp
  )
    throw Error("RASTER_METADATA_REJECTED");
  // Force the complete raster to decode; a header/metadata probe is insufficient.
  const decoded = await image.raw().toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== expected.width ||
    decoded.info.height !== expected.height ||
    decoded.info.channels > 4 ||
    decoded.data.length > maximumPixels * 4
  )
    throw Error("RASTER_DECODE_REJECTED");
  return {
    format,
    width: metadata.width,
    height: metadata.height,
    bytes: bytes.length,
    sha256,
    pixelSha256: crypto.createHash("sha256").update(decoded.data).digest("hex"),
    decoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips },
  };
}
