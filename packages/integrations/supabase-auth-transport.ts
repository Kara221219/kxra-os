const MAX_AUTH_RESPONSE_BYTES = 1024 * 1024;

/** Server-only Auth fetch adapter. Never retries a potentially mutating request. */
export function createSupabaseAuthTransport(options: {
  project: "jlebgsxcvhvpueuibekd" | "lhbgeucifxxcdoyrnesf";
  fetch: typeof fetch;
  deadlineMs?: number;
}): typeof fetch {
  if (
    !["jlebgsxcvhvpueuibekd", "lhbgeucifxxcdoyrnesf"].includes(options.project)
  )
    throw Error("AUTH_TRANSPORT_CONFIGURATION_INVALID");
  const deadlineMs = options.deadlineMs ?? 10_000;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30_000)
    throw Error("AUTH_TRANSPORT_CONFIGURATION_INVALID");
  const origin = `https://${options.project}.supabase.co`;
  const transport = options.fetch;
  return async (input, init) => {
    // Validate before handing headers or bodies to any external transport.
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : String(input));
    } catch {
      throw Error("AUTH_TRANSPORT_ENDPOINT_REJECTED");
    }
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith("/auth/v1/") ||
      /%|\\/.test(url.pathname)
    )
      throw Error("AUTH_TRANSPORT_ENDPOINT_REJECTED");
    const request = new Request(input, init);
    const controller = new AbortController();
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => {
      // Cancellation itself may hang in an injected transport; never await it.
      if (activeReader) void activeReader.cancel().catch(() => {});
    };
    let rejectAbort!: (reason: unknown) => void;
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const abort = (reason: unknown) => {
      controller.abort(reason);
      cancelReader();
      rejectAbort(reason);
    };
    const originalAbort = () => abort(request.signal.reason);
    if (request.signal.aborted) {
      originalAbort();
    } else
      request.signal.addEventListener("abort", originalAbort, { once: true });
    const timer = setTimeout(
      () => abort(new DOMException("Auth request timed out", "TimeoutError")),
      deadlineMs,
    );
    try {
      // Defer invocation so an already-aborted caller never reaches fetch.
      const operation = Promise.resolve().then(async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        try {
          // Pass the controller signal directly, rather than a Request-derived
          // dependent signal whose lifetime a custom fetch may not retain.
          const response = await transport(request, {
            signal: controller.signal,
            redirect: "error",
          });
          if (controller.signal.aborted) throw controller.signal.reason;
          if (
            response.redirected ||
            (response.url && response.url !== request.url)
          )
            throw Error("AUTH_TRANSPORT_REDIRECT_REJECTED");
          // Bound retained decoded bytes, including streams with missing/false lengths.
          // Body reads remain inside the same fetch deadline and caller signal.
          let body: Uint8Array<ArrayBuffer> | null = null;
          if (response.body) {
            const reader = response.body.getReader();
            activeReader = reader;
            try {
              const length = response.headers.get("content-length");
              if (
                length &&
                /^\d+$/.test(length) &&
                Number(length) > MAX_AUTH_RESPONSE_BYTES
              ) {
                cancelReader();
                throw Error("AUTH_TRANSPORT_RESPONSE_TOO_LARGE");
              }
              const chunks: Uint8Array[] = [];
              let total = 0;
              while (true) {
                const next = await reader.read();
                if (controller.signal.aborted) throw controller.signal.reason;
                if (next.done) break;
                total += next.value.byteLength;
                if (total > MAX_AUTH_RESPONSE_BYTES) {
                  cancelReader();
                  throw Error("AUTH_TRANSPORT_RESPONSE_TOO_LARGE");
                }
                // Do not retain oversized backing buffers from small chunk views.
                chunks.push(next.value.slice());
              }
              body = new Uint8Array(total);
              let offset = 0;
              for (const chunk of chunks) {
                body.set(chunk, offset);
                offset += chunk.byteLength;
              }
            } finally {
              activeReader = undefined;
              reader.releaseLock();
            }
          }
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          if (controller.signal.aborted) throw controller.signal.reason;
          // Provider errors can contain request headers/URLs. Do not propagate them.
          throw Error("AUTH_TRANSPORT_FAILED");
        }
      });
      return await Promise.race([operation, cancelled]);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", originalAbort);
    }
  };
}
