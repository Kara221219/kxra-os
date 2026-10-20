/** Owner-authorised, server-only generation. A saved request is polled, never resubmitted. */
import {
  config,
  higgsfield,
  AuthenticationError,
  NotEnoughCreditsError,
} from "@higgsfield/client/v2";
import fs from "node:fs";
import path from "node:path";
const directory = path.resolve(".runtime/consultancy-journey");
const ledger = path.join(directory, "generation.json");
const prompt =
  "An original high-end architectural film for a business consultancy website. A single continuous five-second camera dolly moves straight forward through a spacious sculptural gallery. Midnight navy stone walls, brushed brass architectural frames, warm ivory ceiling light and a dark polished floor with subtle realistic reflections. Three large rectangular doorways sit at successively greater distances, creating strong perspective and clear foreground, middle ground and background depth. The camera passes smoothly through the nearest brass frame towards a warm softly illuminated courtyard, with a slight natural lateral drift and level horizon. The perspective vanishing point sits in the right third of the image; the left half stays dark and visually calm for readable website headings. Minimal architectural forms, expensive material detail, sophisticated international consultancy art direction, physically coherent geometry, consistent exposure, realistic cinematic rendering. Silent, unoccupied architectural environment, no lettering, logos, signs or interface elements. No cuts, sudden transitions, flashing or camera rotation. Landscape 16:9 composition.";
type RecordState = {
  status: string;
  requestId?: string;
  videoUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
};
let record: RecordState;
function save() {
  fs.writeFileSync(ledger, JSON.stringify(record, null, 2), { mode: 0o600 });
}
async function main() {
  if (process.env.KXRA_HIGGSFIELD_APPROVED_RUN !== "CONSULTANCY-JOURNEY-V1")
    throw Error("APPROVAL_REQUIRED");
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials) throw Error("CREDENTIAL_REQUIRED");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(ledger)) {
    record = JSON.parse(fs.readFileSync(ledger, "utf8"));
    if (!record.requestId)
      throw Error("UNCONFIRMED_SUBMISSION_REQUIRES_REVIEW");
  } else {
    record = {
      status: "SUBMITTING",
      createdAt: new Date().toISOString(),
      model: "bytedance/seedance-2.5/text-to-video",
      prompt,
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      approvedTotalBudgetGbp: 25,
      reservedBudgetGbp: 5,
      actualProviderCost: null,
    };
    fs.writeFileSync(ledger, JSON.stringify(record, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    config({ credentials, maxRetries: 0, timeout: 60000 });
    const submitted = await higgsfield.subscribe(
      "bytedance/seedance-2.5/text-to-video",
      {
        input: {
          prompt,
          duration: 5,
          resolution: "720p",
          aspect_ratio: "16:9",
          output_format: "mp4",
          generate_audio: false,
        },
        withPolling: false,
      },
    );
    record.status = submitted.status;
    record.requestId = submitted.request_id;
    record.videoUrl = submitted.video?.url || null;
    save();
    if (!record.requestId) throw Error("REQUEST_ID_MISSING");
    console.log(
      JSON.stringify({
        status: record.status,
        requestId: record.requestId,
        submittedOnce: true,
      }),
    );
  }
  const terminal = [
    "completed",
    "failed",
    "nsfw",
    "moderated",
    "canceled",
    "cancelled",
  ];
  const deadline = Date.now() + 15 * 60 * 1000;
  while (!terminal.includes(record.status)) {
    if (Date.now() > deadline)
      throw Error("POLL_TIMEOUT_RESUME_EXISTING_REQUEST_ONLY");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(
      `https://api.higgsfield.ai/requests/${encodeURIComponent(record.requestId!)}/status`,
      {
        headers: { Authorization: `Key ${credentials}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw Error(`STATUS_HTTP_${response.status}`);
    const result = await response.json();
    record.status = String(result.status).toLowerCase();
    record.videoUrl =
      typeof result.video?.url === "string" ? result.video.url : null;
    record.updatedAt = new Date().toISOString();
    save();
  }
  console.log(
    JSON.stringify({
      status: record.status,
      requestId: record.requestId,
      hasVideo: Boolean(record.videoUrl),
    }),
  );
  if (record.status !== "completed" || !record.videoUrl)
    throw Error("NO_COMPLETED_VIDEO");
  const url = new URL(record.videoUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("OUTPUT_URL_INVALID");
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("video/") ||
    !response.body
  )
    throw Error("VIDEO_DOWNLOAD_FAILED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.length;
    if (size > 40000000) {
      await reader.cancel();
      throw Error("VIDEO_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (size < 1000) throw Error("VIDEO_TOO_SMALL");
  const output = path.join(directory, "source.mp4");
  fs.writeFileSync(output, Buffer.concat(chunks), { mode: 0o600 });
  console.log(JSON.stringify({ status: "downloaded", output, bytes: size }));
}
main().catch((error) => {
  const code =
    error instanceof AuthenticationError
      ? "AUTHENTICATION_REJECTED"
      : error instanceof NotEnoughCreditsError
        ? "API_CREDITS_REQUIRED"
        : error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
          ? error.message
          : "PROVIDER_REQUEST_UNAVAILABLE";
  console.error(code);
  process.exitCode = 1;
});
