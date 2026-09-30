import { config, higgsfield } from "@higgsfield/client/v2";

async function main() {
  const credentials = process.env.HF_CREDENTIALS;
  const confirmation = process.env.KXRA_HIGGSFIELD_BILLABLE_CONFIRMATION;

  if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    throw new Error(
      "HF_CREDENTIALS must be set locally in key-id:key-secret format.",
    );
  }

  if (confirmation !== "GENERATE:SEEDANCE-2.5:5S") {
    throw new Error(
      "Billable generation is locked. Set KXRA_HIGGSFIELD_BILLABLE_CONFIRMATION=GENERATE:SEEDANCE-2.5:5S locally for one reviewed run.",
    );
  }

  config({ credentials });

  const result = await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    {
      input: {
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
        output_format: "mp4",
        generate_audio: true,
      },
      withPolling: true,
    },
  );

  const status = String(result.status).toLowerCase();
  const videoUrl = result.video?.url;

  if (status === "completed" && videoUrl) {
    console.log(videoUrl);
  } else if (
    ["failed", "canceled", "cancelled", "moderated", "nsfw"].includes(status)
  ) {
    throw new Error(`Generation ended with terminal status: ${status}.`);
  } else {
    throw new Error(
      `Generation did not return a completed video URL (status: ${status}).`,
    );
  }
}

main().catch((error) => {
  const safeMessage =
    error instanceof Error &&
    /^(HF_CREDENTIALS|Billable generation is locked|Generation ended|Generation did not return)/.test(
      error.message,
    )
      ? error.message
      : "Higgsfield request failed before a completed video URL was returned.";
  console.error(safeMessage);
  process.exitCode = 1;
});
