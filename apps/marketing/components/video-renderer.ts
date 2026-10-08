export type VideoScene = { id: string; image: ImageBitmap; caption: string };
export const videoMimeTypes = [
  "video/mp4;codecs=avc1.42E01E",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];
export function chooseVideoType() {
  return typeof MediaRecorder === "undefined"
    ? undefined
    : videoMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
}
export async function decodePhoto(file: File): Promise<ImageBitmap> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Each photo must be under 10 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error(
      "Use JPEG, PNG or WebP photos. SVG, HEIC and other files are not supported.",
    );
  const bitmap = await createImageBitmap(file, {
    resizeWidth: 1600,
    resizeQuality: "high",
  });
  if (bitmap.height > 6000 || bitmap.width < 100 || bitmap.height < 100) {
    bitmap.close();
    throw new Error("Use a photo with a normal portrait or landscape shape.");
  }
  return bitmap;
}
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = [];
  let line = "";
  for (const character of text) {
    if (ctx.measureText(line + character).width > width) {
      result.push(line);
      line = "";
    }
    line += character;
  }
  if (line) result.push(line);
  return result;
}
export function drawVideoFrame(
  canvas: HTMLCanvasElement,
  scenes: VideoScene[],
  seconds: number,
  secondsPerScene: number,
  title: string,
  brand: string,
  portrait: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !scenes.length) return;
  const w = portrait ? 720 : 1280,
    h = portrait ? 1280 : 720;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const index = Math.min(
    scenes.length - 1,
    Math.floor(seconds / secondsPerScene),
  );
  const scene = scenes[index];
  const phase = (seconds % secondsPerScene) / secondsPerScene;
  ctx.fillStyle = "#081422";
  ctx.fillRect(0, 0, w, h);
  // Fit the full photo inside a frame: never invent, stretch or crop property details.
  const frameY = portrait ? 210 : 125,
    frameHeight = portrait ? 700 : 395;
  const scale =
    Math.min((w - 80) / scene.image.width, frameHeight / scene.image.height) *
    (0.97 + phase * 0.03);
  const iw = scene.image.width * scale,
    ih = scene.image.height * scale;
  ctx.drawImage(
    scene.image,
    (w - iw) / 2,
    frameY + (frameHeight - ih) / 2,
    iw,
    ih,
  );
  ctx.fillStyle = "#e7c285";
  ctx.font = "20px sans-serif";
  ctx.fillText(brand.slice(0, 40) || "PROPERTY PRESENTATION", 40, 48);
  ctx.fillStyle = "#fff2d9";
  ctx.font = portrait ? "38px Georgia" : "36px Georgia";
  lines(ctx, title, w - 80)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, 40, 105 + i * 44));
  ctx.fillStyle = "#f0ede5";
  ctx.font = "28px sans-serif";
  lines(ctx, scene.caption, w - 100)
    .slice(0, 3)
    .forEach((line, i) =>
      ctx.fillText(line, 50, frameY + frameHeight + 65 + i * 38),
    );
  ctx.fillStyle = "#c3cbd6";
  ctx.font = "18px sans-serif";
  ctx.fillText(
    `${index + 1} / ${scenes.length} · Created with KXRA`,
    40,
    h - 44,
  );
  ctx.fillStyle = "#e7c285";
  ctx.fillRect(
    40,
    h - 24,
    (w - 80) * Math.min(1, seconds / (scenes.length * secondsPerScene)),
    3,
  );
}
export async function exportVideo(
  canvas: HTMLCanvasElement,
  scenes: VideoScene[],
  secondsPerScene: number,
  title: string,
  brand: string,
  portrait: boolean,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const mimeType = chooseVideoType();
  if (!mimeType || !canvas.captureStream)
    throw new Error(
      "This browser cannot export video. Try current Chrome, Edge or Safari on a desktop.",
    );
  drawVideoFrame(canvas, scenes, 0, secondsPerScene, title, brand, portrait);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  let frame = 0;
  let failure: Error | undefined;
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      failure = new Error(
        "Video export failed. Try fewer photos or another browser.",
      );
      if (recorder.state !== "inactive") recorder.stop();
      else reject(failure);
    };
    recorder.onstop = () => {
      if (failure) reject(failure);
      else if (signal.aborted)
        reject(
          new Error(
            "Export cancelled. Your photos are still available in this tab.",
          ),
        );
      else resolve(new Blob(chunks, { type: mimeType }));
    };
  });
  const abort = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  signal.addEventListener("abort", abort, { once: true });
  const hidden = () => {
    if (document.hidden) {
      failure = new Error(
        "Export stopped because the tab was hidden. Keep this tab visible and try again.",
      );
      abort();
    }
  };
  document.addEventListener("visibilitychange", hidden);
  try {
    if (signal.aborted) throw new Error("Export cancelled.");
    recorder.start(250);
    const start = performance.now();
    const duration = scenes.length * secondsPerScene;
    const render = (now: number) => {
      if (recorder.state === "inactive") return;
      const elapsed = Math.min(duration, (now - start) / 1000);
      drawVideoFrame(
        canvas,
        scenes,
        elapsed,
        secondsPerScene,
        title,
        brand,
        portrait,
      );
      progress(Math.round((elapsed / duration) * 100));
      if (elapsed >= duration) recorder.stop();
      else frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return await stopped;
  } finally {
    cancelAnimationFrame(frame);
    signal.removeEventListener("abort", abort);
    document.removeEventListener("visibilitychange", hidden);
    stream.getTracks().forEach((track) => track.stop());
  }
}
