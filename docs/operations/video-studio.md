# Public Video Studio

The marketing route `/video-studio` is a local-device photo-to-video editor. It accepts up to eight JPEG/PNG/WebP photos, checks file signatures and bounds, permits factual captions and scene ordering, and exports a silent portrait or landscape video using Canvas and MediaRecorder. The full source image remains visible. A rights/facts acknowledgement is required before export. Cancellation or a hidden browser tab stops the run; no success/download is shown for a failed export.

Photos are decoded and rendered in browser memory, not posted to KXRA or an AI provider. Reloading clears the project. This route has no account, cloud upload, stored project, remote rendering queue, payment or AI-generation claim. Browser format support determines MP4/WebM. Keep the tab visible during export. Chromium desktop/mobile-size acceptance is automated; physical Safari/iOS acceptance remains unverified. Do not promise universal browser support.

The example at `/samples/kxra-property-demo.mp4` was exported through the real interface using three original fictional architectural illustrations, then transcoded to H.264 for sample playback. It is labelled fictional and is not a client property or evidence of results. No Higgsfield request or credit expenditure was necessary.

Acceptance: reject SVG/invalid signatures and excess counts; decode supported photos; require rights acknowledgement; reorder/remove; export a playable download with no client-photo POST request; invalidate old download on edit; cancel cleanly. Tests: `tests/marketing-e2e/video-studio.spec.ts`.

A managed photo-delivery service is a separate commercial validation experiment. Private research, work-order templates and email drafts are stored in ignored `.runtime/revenue-sprint/launch-pack.html`; they must not be included in deployment or publication snapshots. No messages were sent.
