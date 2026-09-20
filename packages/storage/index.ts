import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const maximumBytes = 20 * 1024 * 1024;
const maximumExtractedCharacters = 2_000_000;
const chunkCharacters = 1200;
const overlapCharacters = 120;
const staticSignatureUpdatedAt = "2026-09-20T00:00:00.000Z";

export type ObjectDescriptor = {
  key: string;
  size: number;
  sha256: string;
};

export interface PrivateObjectStore {
  readonly adapter: string;
  putImmutable(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<ObjectDescriptor | null>;
  list(): Promise<ObjectDescriptor[]>;
  move(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function validObjectKey(key: string) {
  if (
    key.length < 1 ||
    key.length > 500 ||
    key.includes("\\") ||
    key.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\x00-\x1f\x7f]/.test(key)
  )
    throw Error("Invalid private object key");
  return key;
}

export function sha256(bytes: Buffer | string) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export class LocalPrivateObjectStore implements PrivateObjectStore {
  readonly adapter = "LOCAL_IMMUTABLE_V1";
  private readonly root: string;

  constructor(runtime = process.env.KXRA_RUNTIME) {
    if (!runtime) throw Error("Local object runtime is unavailable");
    this.root = path.resolve(runtime, "objects");
  }

  private location(key: string) {
    const resolved = path.resolve(this.root, ...validObjectKey(key).split("/"));
    if (!resolved.startsWith(this.root + path.sep))
      throw Error("Invalid private object key");
    return resolved;
  }

  async putImmutable(key: string, bytes: Buffer, _contentType: string) {
    if (!bytes.length || bytes.length > maximumBytes)
      throw Error("Private object size is invalid");
    const target = this.location(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  }

  async get(key: string) {
    return fs.readFile(this.location(key));
  }

  async head(key: string) {
    try {
      const bytes = await this.get(key);
      return { key, size: bytes.length, sha256: sha256(bytes) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async list() {
    const output: ObjectDescriptor[] = [];
    const walk = async (directory: string) => {
      let entries: Dirent<string>[];
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(target);
        else if (entry.isFile()) {
          const key = path
            .relative(this.root, target)
            .split(path.sep)
            .join("/");
          if (key.startsWith("_reconciliation/")) continue;
          const bytes = await fs.readFile(target);
          output.push({ key, size: bytes.length, sha256: sha256(bytes) });
        }
      }
    };
    await walk(this.root);
    return output.sort((left, right) => left.key.localeCompare(right.key));
  }

  async move(from: string, to: string) {
    const source = this.location(from);
    const destination = this.location(to);
    await fs.mkdir(path.dirname(destination), {
      recursive: true,
      mode: 0o700,
    });
    await fs.rename(source, destination);
  }

  async remove(key: string) {
    await fs
      .unlink(this.location(key))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
}

export class SupabasePrivateObjectStore implements PrivateObjectStore {
  readonly adapter = "SUPABASE_PRIVATE_V1";
  private readonly client;

  constructor(
    url: string,
    secretKey: string,
    private readonly bucket: string,
  ) {
    if (!url || !secretKey || !bucket) throw Error("Storage is not configured");
    this.client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async putImmutable(key: string, bytes: Buffer, contentType: string) {
    validObjectKey(key);
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, bytes, { contentType, upsert: false });
    if (error) throw Error(`Private object upload failed: ${error.message}`);
  }

  async get(key: string) {
    validObjectKey(key);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(key);
    if (error) {
      if (/not found/i.test(error.message))
        throw Object.assign(Error("Private object not found"), {
          code: "ENOENT",
        });
      throw Error(`Private object download failed: ${error.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async head(key: string) {
    try {
      const bytes = await this.get(key);
      return { key, size: bytes.length, sha256: sha256(bytes) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async list() {
    const output: ObjectDescriptor[] = [];
    const pending = [""];
    while (pending.length) {
      const prefix = pending.shift()!;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.client.storage
          .from(this.bucket)
          .list(prefix, {
            limit: 1000,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
        if (error)
          throw Error(`Private object listing failed: ${error.message}`);
        for (const item of data || []) {
          const key = prefix ? `${prefix}/${item.name}` : item.name;
          if (key.startsWith("_reconciliation/")) continue;
          if (!item.id) pending.push(key);
          else {
            const descriptor = await this.head(key);
            if (descriptor) output.push(descriptor);
          }
        }
        if (!data || data.length < 1000) break;
      }
    }
    return output.sort((left, right) => left.key.localeCompare(right.key));
  }

  async move(from: string, to: string) {
    validObjectKey(from);
    validObjectKey(to);
    const { error } = await this.client.storage
      .from(this.bucket)
      .move(from, to);
    if (error) throw Error(`Private object move failed: ${error.message}`);
  }

  async remove(key: string) {
    validObjectKey(key);
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw Error(`Private object removal failed: ${error.message}`);
  }
}

export function privateObjectStore(localFixture = false): PrivateObjectStore {
  if (localFixture) return new LocalPrivateObjectStore();
  if (process.env.KXRA_STORAGE_ENABLED !== "true")
    throw Error("Private object storage is disabled");
  return new SupabasePrivateObjectStore(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_STORAGE_SECRET_KEY || "",
    process.env.KXRA_STORAGE_BUCKET || "",
  );
}

export type ScanResult =
  | {
      outcome: "CLEAN";
      detectedMime: string;
      reasonCode: null;
      report: Record<string, string | number | boolean>;
    }
  | {
      outcome: "REJECTED";
      detectedMime: string | null;
      reasonCode: string;
      report: Record<string, string | number | boolean>;
    };

const textMimes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
const activeOrExecutableExtensions = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dmg",
  ".exe",
  ".hta",
  ".html",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
  ".vbs",
  ".wsf",
]);

function normalizedMime(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function extension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function begins(bytes: Buffer, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function inspectPrivateObject(
  bytes: Buffer,
  filename: string,
  declaredMime: string,
): ScanResult {
  const declared = normalizedMime(declaredMime);
  const suffix = extension(filename);
  const baseReport = {
    bytes: bytes.length,
    declared_mime: declared,
    signature_updated_at: staticSignatureUpdatedAt,
  };
  if (!bytes.length || bytes.length > maximumBytes)
    return {
      outcome: "REJECTED",
      detectedMime: null,
      reasonCode: "SIZE_LIMIT",
      report: baseReport,
    };
  const ascii = bytes.toString("latin1");
  if (ascii.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))
    return {
      outcome: "REJECTED",
      detectedMime: null,
      reasonCode: "MALWARE_DETECTED",
      report: { ...baseReport, signature: "EICAR_TEST" },
    };
  if (
    activeOrExecutableExtensions.has(suffix) ||
    begins(bytes, [0x4d, 0x5a]) ||
    begins(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    begins(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    begins(bytes, [0xfe, 0xed, 0xfa, 0xcf])
  )
    return {
      outcome: "REJECTED",
      detectedMime: "application/x-executable",
      reasonCode: "EXECUTABLE_CONTENT",
      report: baseReport,
    };
  if (
    [".docm", ".xlsm", ".pptm"].includes(suffix) ||
    /macroenabled/i.test(declared)
  )
    return {
      outcome: "REJECTED",
      detectedMime: "application/zip",
      reasonCode: "ACTIVE_CONTENT",
      report: baseReport,
    };
  if (
    begins(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    begins(bytes, [0x50, 0x4b, 0x05, 0x06])
  )
    return {
      outcome: "REJECTED",
      detectedMime: "application/zip",
      reasonCode: "ARCHIVE_EXPANSION_RISK",
      report: baseReport,
    };

  let detected: string | null = null;
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    detected = "application/pdf";
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/i.test(ascii))
      return {
        outcome: "REJECTED",
        detectedMime: detected,
        reasonCode: "ACTIVE_CONTENT",
        report: baseReport,
      };
  } else if (begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    detected = "image/png";
  else if (begins(bytes, [0xff, 0xd8, 0xff])) detected = "image/jpeg";
  else {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/\u0000/.test(decoded)) throw Error("Binary text");
      if (declared === "application/json" || suffix === ".json") {
        JSON.parse(decoded);
        detected = "application/json";
      } else detected = textMimes.has(declared) ? declared : "text/plain";
    } catch {
      return {
        outcome: "REJECTED",
        detectedMime: null,
        reasonCode: "ENCODING_OR_MAGIC_INVALID",
        report: baseReport,
      };
    }
  }

  const compatible =
    declared === "application/octet-stream" ||
    declared === detected ||
    (textMimes.has(declared) && textMimes.has(detected));
  if (!compatible)
    return {
      outcome: "REJECTED",
      detectedMime: detected,
      reasonCode: "MIME_MISMATCH",
      report: { ...baseReport, detected_mime: detected },
    };
  if (
    !textMimes.has(detected) &&
    !["image/png", "image/jpeg", "application/pdf"].includes(detected)
  )
    return {
      outcome: "REJECTED",
      detectedMime: detected,
      reasonCode: "MIME_NOT_ALLOWED",
      report: { ...baseReport, detected_mime: detected },
    };
  return {
    outcome: "CLEAN",
    detectedMime: detected,
    reasonCode: null,
    report: {
      ...baseReport,
      detected_mime: detected,
      magic_checked: true,
      active_content_checked: true,
    },
  };
}

export type ExtractedChunk = {
  ordinal: number;
  start_offset: number;
  end_offset: number;
  content: string;
  content_sha256: string;
  token_estimate: number;
};

export type ExtractionResult =
  | {
      outcome: "EXTRACTED";
      extractedSha256: string;
      chunks: ExtractedChunk[];
    }
  | { outcome: "FAILED"; reasonCode: string; chunks: [] };

export function chunkExtractedText(input: string): ExtractedChunk[] {
  const normalized = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .trim();
  if (!normalized || normalized.length > maximumExtractedCharacters) return [];
  const chunks: ExtractedChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkCharacters, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(chunkCharacters / 2)) end = boundary;
    }
    const candidate = normalized.slice(start, end);
    const leadingWhitespace = candidate.length - candidate.trimStart().length;
    const trailingWhitespace = candidate.length - candidate.trimEnd().length;
    const content = candidate.trim();
    if (content) {
      chunks.push({
        ordinal: chunks.length,
        start_offset: start + leadingWhitespace,
        end_offset: end - trailingWhitespace,
        content,
        content_sha256: sha256(content),
        token_estimate: Math.max(1, Math.ceil(content.length / 4)),
      });
    }
    if (end >= normalized.length) break;
    const next = Math.max(start + 1, end - overlapCharacters);
    start = next;
  }
  return chunks;
}

export function extractPrivateObject(
  bytes: Buffer,
  filename: string,
  detectedMime: string,
): ExtractionResult {
  let text: string;
  if (textMimes.has(detectedMime)) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (detectedMime === "application/json")
        text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return {
        outcome: "FAILED",
        reasonCode: "EXTRACTION_INVALID",
        chunks: [],
      };
    }
  } else if (["image/png", "image/jpeg"].includes(detectedMime)) {
    text = `File ${filename}. Verified media type ${detectedMime}. No semantic image description has been generated.`;
  } else {
    return {
      outcome: "FAILED",
      reasonCode: "EXTRACTOR_UNAVAILABLE",
      chunks: [],
    };
  }
  const chunks = chunkExtractedText(text);
  if (!chunks.length)
    return { outcome: "FAILED", reasonCode: "EMPTY_EXTRACTION", chunks: [] };
  return {
    outcome: "EXTRACTED",
    extractedSha256: sha256(text.trim()),
    chunks,
  };
}

export const storagePolicy = {
  maximumBytes,
  maximumExtractedCharacters,
  chunkCharacters,
  overlapCharacters,
  scannerAdapter: "KXRA_LOCAL_STATIC_SCANNER",
  scannerVersion: "1",
  scannerSignatureUpdatedAt: staticSignatureUpdatedAt,
  extractorAdapter: "KXRA_ISOLATED_TEXT_EXTRACTOR",
  extractorVersion: "1",
} as const;
