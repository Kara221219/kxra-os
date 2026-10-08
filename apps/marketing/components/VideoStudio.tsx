"use client";
import { useEffect, useRef, useState } from "react";
import {
  chooseVideoType,
  decodePhoto,
  drawVideoFrame,
  exportVideo,
  type VideoScene,
} from "./video-renderer";

export function VideoStudio() {
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [title, setTitle] = useState("Your next chapter");
  const [brand, setBrand] = useState("");
  const [portrait, setPortrait] = useState(true);
  const [seconds, setSeconds] = useState(4);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState(0);
  const [output, setOutput] = useState<{
    url: string;
    extension: string;
  } | null>(null);
  const [supported, setSupported] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(scenes);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setSupported(!!chooseVideoType());
    return () => {
      alive.current = false;
      abort.current?.abort();
      current.current.forEach((scene) => scene.image.close());
    };
  }, []);
  useEffect(() => {
    current.current = scenes;
    if (canvas.current)
      drawVideoFrame(
        canvas.current,
        scenes,
        Math.min(selected, scenes.length - 1) * seconds,
        seconds,
        title,
        brand,
        portrait,
      );
  }, [scenes, title, brand, portrait, seconds, selected]);
  useEffect(
    () => () => {
      if (output) URL.revokeObjectURL(output.url);
    },
    [output],
  );
  const invalidate = () => setOutput(null);
  async function add(files: FileList | null) {
    if (!files || loading || busy) return;
    const batch = Array.from(files);
    setMessage("");
    if (
      scenes.length + batch.length > 8 ||
      batch.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024
    ) {
      setMessage("Select at most eight photos, up to 40 MB per selection.");
      return;
    }
    setLoading(true);
    const added: VideoScene[] = [];
    try {
      for (const file of batch)
        added.push({
          id: crypto.randomUUID(),
          image: await decodePhoto(file),
          caption: "",
        });
      if (!alive.current) {
        added.forEach((scene) => scene.image.close());
        return;
      }
      invalidate();
      setScenes((previous) => [...previous, ...added]);
      setMessage(
        `${added.length} photos ready. Add only facts you have verified.`,
      );
    } catch {
      added.forEach((scene) => scene.image.close());
      if (alive.current)
        setMessage(
          "Could not read these photos. Use JPEG, PNG or WebP, under 10 MB each, with a normal portrait or landscape shape.",
        );
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  async function generate() {
    if (!canvas.current || !rights || !scenes.length || busy) return;
    setBusy(true);
    invalidate();
    setProgress(0);
    setMessage("Exporting on your device. Keep this tab open and visible.");
    abort.current = new AbortController();
    try {
      const blob = await exportVideo(
        canvas.current,
        scenes,
        seconds,
        title,
        brand,
        portrait,
        abort.current.signal,
        setProgress,
      );
      if (!alive.current) return;
      if (!blob.size)
        throw new Error(
          "The browser returned an empty video. Please try again.",
        );
      setOutput({
        url: URL.createObjectURL(blob),
        extension: blob.type.startsWith("video/mp4") ? "mp4" : "webm",
      });
      setMessage(
        "Video ready. Play it through and check every fact before sharing.",
      );
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Export failed. Please try again.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="video-workspace">
      <div className="video-controls">
        <p className="notice">
          Photos stay on this device. No upload, account, AI provider or payment
          is required. Work is cleared when you close or reload this tab.
          Download your video before leaving.
        </p>
        {!supported ? (
          <p role="alert">
            Video export is unavailable in this browser. Try current desktop
            Chrome, Edge or Safari.
          </p>
        ) : null}
        <fieldset disabled={busy || loading}>
          <legend>1. Select your photos</legend>
          <label>
            JPEG, PNG or WebP · up to 8 photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                void add(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <p>
            Use photos you own or have permission to use. This tool preserves
            the full image and adds gentle camera movement; it does not invent
            rooms or create a simulated walkthrough.
          </p>
          <h2>2. Set the presentation</h2>
          <label>
            Title
            <input
              value={title}
              maxLength={60}
              onChange={(event) => {
                invalidate();
                setTitle(event.target.value);
              }}
            />
          </label>
          <label>
            Agency or brand
            <input
              value={brand}
              maxLength={40}
              onChange={(event) => {
                invalidate();
                setBrand(event.target.value);
              }}
            />
          </label>
          <label>
            Format
            <select
              value={portrait ? "portrait" : "landscape"}
              onChange={(event) => {
                invalidate();
                setPortrait(event.target.value === "portrait");
              }}
            >
              <option value="portrait">Portrait · 720 × 1280</option>
              <option value="landscape">Landscape · 1280 × 720</option>
            </select>
          </label>
          <label>
            Seconds per photo
            <select
              value={seconds}
              onChange={(event) => {
                invalidate();
                setSeconds(Number(event.target.value));
              }}
            >
              <option value={3}>3 seconds</option>
              <option value={4}>4 seconds</option>
              <option value={5}>5 seconds</option>
            </select>
          </label>
          <ol className="video-scenes">
            {scenes.map((scene, index) => (
              <li key={scene.id}>
                <label>
                  Photo {index + 1} caption
                  <input
                    maxLength={100}
                    value={scene.caption}
                    onChange={(event) => {
                      invalidate();
                      setScenes((items) =>
                        items.map((item) =>
                          item.id === scene.id
                            ? { ...item, caption: event.target.value }
                            : item,
                        ),
                      );
                    }}
                  />
                </label>
                <div className="video-scene-actions">
                  <button type="button" onClick={() => setSelected(index)}>
                    Preview photo {index + 1}
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      invalidate();
                      setScenes((items) => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        return next;
                      });
                      setSelected(index - 1);
                    }}
                  >
                    Move photo {index + 1} up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      invalidate();
                      scene.image.close();
                      setScenes((items) =>
                        items.filter((item) => item.id !== scene.id),
                      );
                      setSelected(0);
                    }}
                  >
                    Remove photo {index + 1}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <label className="video-consent">
            <input
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
            />
            I have permission to use these photos and have checked the captions
            and property facts.
          </label>
        </fieldset>
        <button
          className="button"
          type="button"
          disabled={!scenes.length || !rights || busy || loading || !supported}
          onClick={() => void generate()}
        >
          {busy ? `Exporting ${progress}%` : "Create my video"}
        </button>
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()}>
            Cancel export
          </button>
        ) : null}
        <p role="status" aria-live="polite">
          {loading ? "Reading photos…" : message}
        </p>
      </div>
      <div className="video-preview">
        <h2>Review your video</h2>
        <canvas
          ref={canvas}
          width={720}
          height={1280}
          aria-label="Selected photo and caption preview"
        />
        {!scenes.length ? (
          <p>Select photos to build your first video.</p>
        ) : null}
        <p>
          Silent export: MP4 where your browser supports it, otherwise WebM.
          Confirm the format accepted by your publishing channel. No audio is
          added.
        </p>
        {output ? (
          <>
            <video
              controls
              playsInline
              src={output.url}
              aria-label="Finished video"
            />
            <a
              className="button"
              href={output.url}
              download={`kxra-property-video.${output.extension}`}
            >
              Download {output.extension.toUpperCase()} video
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
