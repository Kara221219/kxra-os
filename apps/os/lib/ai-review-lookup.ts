import {
  parseAiSetupStatus,
  type AiSetupStatus,
} from "../../../packages/admission/ai-setup-status";

// Bound the entire read, including response-body consumption. Aborting the
// transport alone is insufficient if a stalled implementation ignores abort.
export async function readAiReview(
  signal: AbortSignal,
  id?: string,
): Promise<AiSetupStatus | null> {
  const transport = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new Error("REVIEW_LOOKUP_CANCELLED"));
      transport.abort();
    };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      reject(new Error("REVIEW_LOOKUP_TIMEOUT"));
      transport.abort();
    }, 15_000);
  });
  try {
    if (signal.aborted) {
      cancel();
      return await stopped;
    }
    const read = async () => {
      const response = await fetch(
        "/api/ai-connection-admission" +
          (id ? "?id=" + encodeURIComponent(id) : ""),
        { cache: "no-store", signal: transport.signal },
      );
      if (!response.ok) throw new Error("UNAVAILABLE");
      const body = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).join(",") !== "admission"
      )
        throw new Error("INVALID");
      return body.admission === null
        ? null
        : parseAiSetupStatus(body.admission);
    };
    return await Promise.race([read(), stopped]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
