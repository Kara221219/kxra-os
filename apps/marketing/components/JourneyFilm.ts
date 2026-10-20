/** Scroll controls time; the film never autoplays. Media is never loaded in reading mode. */
export function createJourneyFilm(
  video: HTMLVideoElement,
  source: string,
  onState: (state: "poster" | "loading" | "ready" | "unavailable") => void,
) {
  let enabled = false;
  let loaded = false;
  let failed = false;
  let progress = 0;
  const seek = () => {
    if (
      !enabled ||
      failed ||
      video.readyState < 1 ||
      video.seeking ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      return;
    const target =
      Math.min(1, Math.max(0, progress)) * Math.max(0, video.duration - 0.06);
    if (Math.abs(video.currentTime - target) > 0.04) {
      try {
        video.currentTime = target;
      } catch {
        /* Poster remains available if the browser refuses seeking. */
      }
    }
  };
  const ready = () => {
    if (enabled && !failed) {
      onState("ready");
      seek();
    }
  };
  const unavailable = () => {
    if (enabled) {
      failed = true;
      onState("unavailable");
    }
  };
  video.addEventListener("loadedmetadata", seek);
  video.addEventListener("loadeddata", ready);
  video.addEventListener("seeked", seek);
  video.addEventListener("error", unavailable);
  return {
    update(active: boolean, value: number) {
      enabled = active;
      progress = Number.isFinite(value) ? value : 0;
      if (!active) {
        if (loaded) {
          video.removeAttribute("src");
          video.load();
          loaded = false;
        }
        onState("poster");
        return;
      }
      if (failed) return;
      if (!loaded) {
        loaded = true;
        onState("loading");
        video.src = source;
        video.load();
      }
      seek();
    },
    dispose() {
      enabled = false;
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("seeked", seek);
      video.removeEventListener("error", unavailable);
      if (loaded) {
        video.removeAttribute("src");
        video.load();
      }
    },
  };
}
