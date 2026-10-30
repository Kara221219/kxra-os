# Shared Perspective hero media review

The supplied hero is a **PNG still**, not the historical MP4 written by the sprint script in CodeQL alert 22. Review of the current design checkout found static AVIF/WebP references in `apps/marketing/app/page.tsx`, with widths 640/960/1280/2048 and an explicit WebP fallback. No automatic import or conversion of `.runtime/business-sprints-assets/hero-source.mp4` into this page was found. That distinction permits source-level acceptance of the reviewed static images without claiming that a different legacy video was inspected or that a remote alert was resolved.

## Exact asset evidence

- Original: `kxra-shared-perspective-hero-v1.png`, 3,575,857 bytes, 2688×1152, RGB, one raster. SHA-256: `bac6614810d37f33c46aae7f9c898c97a9c7c7353fbadbde5f3876e738822585`.
- All 8 AVIF/WebP exports were read through no-follow descriptors, checked against declared dimensions and design-provenance byte hashes, and fully decoded into raw pixels using sharp 0.35.5 / libvips 8.18.7. This was not a header-only probe. All 8 corresponding copies in the design site's `public/media/perspective` matched the same hashes and passed the same checks.
- Every inspected image was single-frame and had no EXIF, ICC, IPTC or XMP payload reported by the decoder. The original PNG contains only IHDR/IDAT/IEND chunks. AVIF exports contain ftyp/meta/mdat framing. The largest 2048 AVIF is 39,666 bytes and WebP is 39,446 bytes.
- The worker's export script uses `Image.open(source).convert('RGB')`, a Lanczos resize and fresh AVIF 65/WebP 82 encodings. The security review reproduced these8 outputs in memory from the original. All 8 reproduced outputs were byte-identical; no original, export, design manifest or site file was modified.
- The design source includes `X-Content-Type-Options: nosniff`. The final integrated artifact and actual HTTP response MIME/headers still require release-owner verification; this review made no hosted request.

The source/export/provenance/page-file hashes, full-decode pixel hashes and decoder versions are in the local handoff `reviewed-hero-asset-receipt.json`; encoder reproduction results are in `hero-export-reproduction.json`. These prove consistency of the inspected local bytes and pipeline. They do not independently authenticate a generation account or provider provenance claim. The original digest should be retained with the final design provenance to bind later exports to the inspected source.

## Reusable offline check and boundary

`scripts/reviewed-raster.mjs` provides `reviewRasterAsset(bytes, { format, width, height, sha256 })` for the independently reviewed exact-byte manifest. It accepts only a bounded, hash-matching PNG/WebP/AVIF static raster, restricts container framing, rejects animation and extra metadata/trailing payloads under this export policy, verifies dimensions, and forces a complete raw-pixel decode. Limits are 10 MB compressed input, 4096 pixels per side, 16 million pixels and a decoder processing timeout. The existing lockfile-resolved sharp dependency is used; missing native decoder support fails the check. No package/dependency, app ingestion route or publishing hook was changed.

The helper is a review check for offline static exports. It is not an upload API, sanitizer, media-decoder sandbox, malware scanner, video validator or automatic publication approval. An attacker-controlled manifest is not an approval source; reviewers must supply the expected hashes/dimensions independently. Asset publication must use those exact bytes and preserve the final artifact boundary. Animated images, SVG, video and more complex container variants fail closed and require their own review workflow.

Tests cover valid full decode of all3 formats; hash/format/dimension/byte-limit rejection; trailing bytes; animation/private-metadata chunks; and corrupt compressed image data even when its digest matches the supplied expectation. The 3 new media checks and 16 existing security/account checks passed, with TypeScript, changed-file formatting, whitespace and publication secret checks.

## Additional timing draft and remaining alert 22 gate

A locally derived timing draft, `kxra-timing-preview-20s.mp4`, was also available during review. An immutable private snapshot was inspected with ffprobe and completely decoded, including audio, with FFmpeg's network protocols and external tracks disabled. It contains 600 H.264 1920×1080 yuv420p frames at 30 fps and stereo 48 kHz AAC, duration 20 seconds, 2,273,063 bytes. SHA-256: `546449b7717a1051feaa9545a461906ae699e47db015cbd5c251867ed1f21c92`. Full decode reported no errors; the source remained unchanged across the check. This is a timing draft, not visual approval or validation of the historical sprint download. Receipt: `timing-preview-media-review.json`.

Alert22 remains **unresolved for the historical/future downloaded MP4** because that exact file was not provided and it is not the current hero's input. Before any separately authorized use/publication of a downloaded video: inspect its exact hash and provenance; use the hardened download/private custody controls; perform bounded format/stream checks and full decode/re-encoding with network/external references disabled; and review the final output and publication artifact. A MIME header alone is insufficient. No new media generation, provider call, hosted action, asset edit or publication occurred here.

For the current still-image hero, the local content-validation condition is satisfied for the hashes in the handoff receipt. Remaining launch acceptance is the release owner's exact integration/artifact/HTTP check and the existing hosted auth, tenant and payment gates; these remain independent of media review.
