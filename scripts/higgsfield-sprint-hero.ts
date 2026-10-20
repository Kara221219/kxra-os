import { config, higgsfield } from "@higgsfield/client/v2";
import fs from "node:fs";
import path from "node:path";
const prompt =
  "A single uninterrupted five-second cinematic camera move through an original architectural sculpture representing a business problem becoming a clear execution path. Deep midnight navy environment, brushed dark-metal rectangular planes and warm champagne-gold edge light. Begin with three elegantly offset planes at different depths; glide slowly forward along the central axis as they resolve visually into an ordered pathway leading to one illuminated opening. Refined editorial composition, restrained contrast, realistic material shading, soft volumetric depth, clean negative space across the left half for HTML headline. Camera level, no spinning, no sudden cuts, no flashing. No people, offices claiming to be ours, logos, typography, interface text, charts, money, recognisable brand assets or fabricated business results. End with a calm composition suitable for a gentle loop. Premium architectural photography, subtle motion, no neon gaming aesthetic, no exaggerated lens distortion.";
const directory = path.resolve(".runtime/business-sprints-assets");
const ledger = path.join(directory, "hero-generation.json");
async function main() {
  if (process.env.KXRA_HIGGSFIELD_APPROVED_RUN !== "SPRINT-HERO-V1")
    throw Error("GENERATION_APPROVAL_REQUIRED");
  if (!process.env.HF_CREDENTIALS) throw Error("API_CREDENTIAL_REQUIRED");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(ledger))
    throw Error("GENERATION_ALREADY_TRACKED_DO_NOT_RESUBMIT");
  const record = {
    model: "bytedance/seedance-2.5/text-to-video",
    prompt,
    duration: 5,
    resolution: "720p",
    aspect_ratio: "16:9",
    generate_audio: false,
    approvedTotalBudgetGbp: 25,
    reservedBudgetGbp: 5,
    actualProviderCost: null,
    status: "SUBMITTING",
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(ledger, JSON.stringify(record, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  config({
    credentials: process.env.HF_CREDENTIALS,
    maxRetries: 0,
    maxPollTime: 15 * 60 * 1000,
    pollInterval: 5000,
  });
  const result = await higgsfield.subscribe(record.model, {
    input: {
      prompt,
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      output_format: "mp4",
      generate_audio: false,
    },
    withPolling: true,
  });
  fs.writeFileSync(
    ledger,
    JSON.stringify(
      {
        ...record,
        status: result.status,
        requestId: result.request_id,
        completedAt: new Date().toISOString(),
        videoUrl: result.video?.url || null,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (result.status !== "completed" || !result.video?.url)
    throw Error("GENERATION_NOT_COMPLETED");
  const url = new URL(result.video.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("OUTPUT_URL_INVALID");
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("video/")
  )
    throw Error("OUTPUT_DOWNLOAD_FAILED");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 40_000_000 || bytes.length < 1000)
    throw Error("OUTPUT_SIZE_INVALID");
  fs.writeFileSync(path.join(directory, "hero-source.mp4"), bytes, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      status: "completed",
      requestId: result.request_id,
      output: path.join(directory, "hero-source.mp4"),
      actualProviderCost: "not reported by generation response",
    }),
  );
}
main().catch(() => {
  console.error(
    "Higgsfield hero request did not complete locally. Inspect the private status ledger before any retry; no credentials or provider error body logged.",
  );
  process.exitCode = 1;
});
