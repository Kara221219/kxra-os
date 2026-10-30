import {
  config,
  higgsfield,
  AuthenticationError,
  NotEnoughCreditsError,
} from "@higgsfield/client/v2";
import {
  openPrivateFile,
  privateDirectory,
} from "../private-operator-files.mjs";
import path from "node:path";
const ledger = path.resolve(".runtime/higgsfield-seedance-example.json");

let ledgerFile: ReturnType<typeof openPrivateFile> | undefined;
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

  privateDirectory(path.dirname(ledger));
  ledgerFile = openPrivateFile(ledger, true);
  ledgerFile.write(
    JSON.stringify(
      {
        status: "SUBMITTING",
        createdAt: new Date().toISOString(),
        model: "bytedance/seedance-2.5/text-to-video",
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
      },
      null,
      2,
    ),
  );
  config({ credentials, maxRetries: 0, maxPollTime: 15 * 60 * 1000 });

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
  ledgerFile.write(
    JSON.stringify(
      {
        status,
        requestId: result.request_id,
        videoUrl: result.video?.url || null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const videoUrl = result.video?.url;

  if (status === "completed" && videoUrl) {
    console.log(JSON.stringify({ status, hasVideo: true, ledger }));
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

main()
  .catch((error) => {
    const rejection =
      error instanceof AuthenticationError
        ? "AUTHENTICATION_REJECTED"
        : error instanceof NotEnoughCreditsError
          ? "API_CREDITS_REQUIRED"
          : null;
    if (rejection && ledgerFile)
      ledgerFile.write(
        JSON.stringify(
          {
            status: rejection,
            updatedAt: new Date().toISOString(),
            videoUrl: null,
          },
          null,
          2,
        ),
      );
    if (rejection) {
      console.error(
        rejection === "AUTHENTICATION_REJECTED"
          ? "Higgsfield rejected the saved API credential. A valid key ID and secret must be entered locally."
          : "Higgsfield API credits are unavailable. No completed video URL was returned.",
      );
      process.exitCode = 1;
      return;
    }
    const safeMessage =
      error instanceof Error &&
      /^(HF_CREDENTIALS|Billable generation is locked|Generation ended|Generation did not return|Generation already tracked)/.test(
        error.message,
      )
        ? error.message
        : "Higgsfield request failed before a completed video URL was returned.";
    console.error(safeMessage);
    process.exitCode = 1;
  })
  .finally(() => ledgerFile?.close());
