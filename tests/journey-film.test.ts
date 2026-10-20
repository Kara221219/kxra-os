import { test } from "node:test";
import assert from "node:assert/strict";
import { createJourneyFilm } from "../apps/marketing/components/JourneyFilm";
class Media extends EventTarget {
  src = "";
  readyState = 0;
  seeking = false;
  duration = Number.NaN;
  currentTime = 0;
  loads = 0;
  load() {
    this.loads++;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}
test("scroll film loads only with motion, seeks both ways and unloads for reading", () => {
  const media = new Media();
  const states: string[] = [];
  const film = createJourneyFilm(
    media as unknown as HTMLVideoElement,
    "/film.mp4",
    (state) => states.push(state),
  );
  film.update(false, 0);
  assert.equal(media.loads, 0);
  film.update(true, 0.8);
  assert.equal(media.loads, 1);
  assert.equal(media.currentTime, 0);
  media.readyState = 2;
  media.duration = 5;
  media.dispatchEvent(new Event("loadedmetadata"));
  assert.ok(Math.abs(media.currentTime - 3.952) < 0.001);
  media.dispatchEvent(new Event("loadeddata"));
  assert.equal(states.at(-1), "ready");
  film.update(true, 0.2);
  assert.ok(media.currentTime < 1);
  media.seeking = true;
  film.update(true, 1);
  assert.ok(media.currentTime < 1);
  media.seeking = false;
  media.dispatchEvent(new Event("seeked"));
  assert.equal(media.currentTime, 4.94);
  film.update(true, -5);
  assert.equal(media.currentTime, 0);
  film.update(false, 1);
  assert.equal(media.src, "");
  assert.equal(states.at(-1), "poster");
  film.dispose();
  media.dispatchEvent(new Event("loadeddata"));
  assert.equal(states.at(-1), "poster");
});
test("a failed film keeps its fallback and does not loop network requests", () => {
  const media = new Media();
  const states: string[] = [];
  const film = createJourneyFilm(
    media as unknown as HTMLVideoElement,
    "/film.mp4",
    (state) => states.push(state),
  );
  film.update(true, 0);
  media.dispatchEvent(new Event("error"));
  assert.equal(states.at(-1), "unavailable");
  film.update(true, 0.9);
  film.update(true, Number.NaN);
  assert.equal(media.loads, 1);
  film.dispose();
});
