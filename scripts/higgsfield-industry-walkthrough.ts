/** Owner-authorised, server-only generation. A saved request is polled, never resubmitted. */
import {
  config,
  higgsfield,
  AuthenticationError,
  NotEnoughCreditsError,
} from "@higgsfield/client/v2";
import {
  openPrivateFile,
  privateDirectory,
  writePrivateOutput,
} from "./private-operator-files.mjs";
import { downloadOperatorVideo } from "./higgsfield-download";
import path from "node:path";
const directory = path.resolve(".runtime/industry-walkthrough");
const ledger = path.join(directory, "generation.json");
const prompt =
  "An original twelve-second architectural walkthrough for a contemporary business consultancy website. One physically continuous camera move at a calm walking pace through a bright connected exhibition pavilion, like a beautifully rendered interior tour. Pure white plaster, pale neutral grey concrete, graphite furniture, clear glass and small precise signal-red accents. Neutral daylight and realistic high-end architectural rendering. Begin in a spacious entrance lobby with a sculptural white worktable. Move forward with gentle physically plausible turns through three connected open exhibition areas: first a property and hospitality space with a detailed architectural scale model and a contemporary lounge; then a retail space with minimalist product display plinths and orderly shelving; then a professional-services work studio with desks, document trays and blank desktop monitors. Finish approaching a large clean blank screen in a calm operations studio for a real HTML software demonstration to overlay. Maintain a consistent floor line and spatial continuity, revealing a clearly different business environment in each area rather than repeating a corridor. Wide 24mm lens, level horizon, stable geometry, subtle foreground and background parallax, steady exposure. Balanced negative space for website headings. Silent landscape 16:9. No cuts, teleporting, morphing, people, brands, lettering, gold, brass, navy or cream.";
// Billing inspected in the authenticated API console, 15 October 2026:
// $1.96 net usage; $38.04 credit; auto-top-up off. The published text-to-video
// rate range tops out at $0.7961/second. This fixed 12-second request therefore
// reserves $9.56, conservatively, below a stricter $20 project ceiling.
const budget = {
  verifiedPriorNetUsd: 1.96,
  maxRateUsdPerSecond: 0.7961,
  seconds: 12,
  conservativeProjectCapUsd: 20,
};
const worstCaseUsd =
  Math.ceil(budget.seconds * budget.maxRateUsdPerSecond * 100) / 100;
if (
  budget.verifiedPriorNetUsd + worstCaseUsd >
  budget.conservativeProjectCapUsd
)
  throw Error("PROJECT_SPEND_LIMIT");
type RecordState = {
  status: string;
  requestId?: string;
  videoUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
};
let record: RecordState;
let ledgerFile: ReturnType<typeof openPrivateFile> | undefined;
function save() {
  if (!ledgerFile) throw Error("LEDGER_NOT_OPEN");
  ledgerFile.write(JSON.stringify(record, null, 2));
}
async function main() {
  if (process.env.KXRA_HIGGSFIELD_APPROVED_RUN !== "INDUSTRY-WALKTHROUGH-V2")
    throw Error("APPROVAL_REQUIRED");
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials) throw Error("CREDENTIAL_REQUIRED");
  privateDirectory(path.dirname(directory));
  privateDirectory(directory);
  ledgerFile = openPrivateFile(ledger);
  if (!ledgerFile.created) {
    record = JSON.parse(ledgerFile.read());
    if (!record.requestId)
      throw Error("UNCONFIRMED_SUBMISSION_REQUIRES_REVIEW");
  } else {
    record = {
      status: "SUBMITTING",
      createdAt: new Date().toISOString(),
      model: "bytedance/seedance-2.5/text-to-video",
      prompt,
      duration: budget.seconds,
      resolution: "720p",
      aspect_ratio: "16:9",
      approvedTotalBudgetGbp: 25,
      reservedMaximumUsd: worstCaseUsd,
      verifiedPriorNetUsd: budget.verifiedPriorNetUsd,
      conservativeProjectCapUsd: budget.conservativeProjectCapUsd,
      actualProviderCost: null,
    };
    save();
    config({ credentials, maxRetries: 0, timeout: 60000 });
    const submitted = await higgsfield.subscribe(
      "bytedance/seedance-2.5/text-to-video",
      {
        input: {
          prompt,
          duration: budget.seconds,
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
  const bytes = await downloadOperatorVideo(record.videoUrl);
  const output = path.join(directory, "source.mp4");
  writePrivateOutput(output, bytes);
  const size = bytes.length;
  console.log(JSON.stringify({ status: "downloaded", output, bytes: size }));
}
main()
  .finally(() => ledgerFile?.close())
  .catch((error) => {
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
