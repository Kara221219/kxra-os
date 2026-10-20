"use client";

import { PlatformTour } from "./PlatformTour";
import { useEffect, useRef, useState } from "react";
import { drawJourneyWorld } from "./JourneyWorld";
import { createJourneyFilm } from "./JourneyFilm";
import type { JourneyMedia } from "../lib/journey-media";

export type JourneyChapter = {
  index: string;
  anchor: string;
  label: string;
  eyebrow: string;
  title: string;
  copy: string;
  tags: readonly string[];
  signal: string;
};

export function ImmersiveJourney({
  chapters,
  media,
}: {
  chapters: readonly JourneyChapter[];
  media?: JourneyMedia | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const layers = Array.from(
      section.querySelectorAll<HTMLElement>(".cinema-chapter"),
    );
    const stage = section.querySelector<HTMLElement>(".cinema-stage")!;
    const film =
      media && videoRef.current
        ? createJourneyFilm(videoRef.current, media.video, (state) => {
            stage.dataset.filmState = state;
          })
        : null;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    let frame = 0;
    let filmStarted = false;
    const update = () => {
      frame = 0;
      // Short viewports (including text zoom) use the complete readable document.
      const enhanced =
        !reading &&
        !preference.matches &&
        window.innerHeight >= 620 &&
        parseFloat(getComputedStyle(document.documentElement).fontSize) < 24;
      const header =
        document.querySelector("header")?.getBoundingClientRect().height || 0;
      section.style.setProperty("--site-header", `${header}px`);
      section.classList.toggle("cinema--enhanced", enhanced);
      const progress = enhanced
        ? Math.max(
            0,
            Math.min(
              1,
              (header - section.getBoundingClientRect().top) /
                Math.max(1, section.offsetHeight - stage.offsetHeight),
            ),
          )
        : 0;
      stage.style.setProperty("--journey-progress", progress.toFixed(4));
      const bounds = section.getBoundingClientRect();
      const inView = bounds.bottom > header && bounds.top < window.innerHeight;
      if (progress > 0 && inView) filmStarted = true;
      film?.update(
        enhanced && inView && filmStarted && !connection?.saveData,
        progress,
      );
      const position = progress * (layers.length - 1);
      const active = Math.round(position);
      layers.forEach((layer, index) => {
        const delta = index - position;
        const isActive = !enhanced || index === active;
        layer.dataset.active = String(isActive);
        layer.inert = !isActive;
        if (enhanced) layer.setAttribute("aria-hidden", String(!isActive));
        else layer.removeAttribute("aria-hidden");
        layer.style.setProperty("--camera-z", `${-delta * 550}px`);
        layer.style.setProperty(
          "--camera-opacity",
          String(Math.max(0, 1 - Math.abs(delta) * 1.65)),
        );
      });
      const contactVisible =
        (document.getElementById("contact")?.getBoundingClientRect().top ??
          Infinity) <
        header + 150;
      const activeAnchor = contactVisible
        ? "contact"
        : chapters[active]?.anchor;
      document
        .querySelectorAll<HTMLAnchorElement>(".site-header nav a")
        .forEach((link) => {
          const anchor = new URL(link.href).hash.slice(1);
          const current =
            anchor === activeAnchor ||
            (anchor === "industries" &&
              ["retail", "services"].includes(activeAnchor));
          if (current) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      section
        .querySelectorAll<HTMLButtonElement>(".cinema-nav button")
        .forEach((button, index) =>
          button.setAttribute(
            "aria-current",
            enhanced && index === active ? "step" : "false",
          ),
        );
      drawJourneyWorld(canvas, progress);
    };
    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const followHash = () => {
      const index = chapters.findIndex(
        (item) => item.anchor === window.location.hash.slice(1),
      );
      if (index >= 0) goTo(index);
    };
    const followLink = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!link) return;
      const destination = new URL(link.href);
      if (
        destination.origin !== location.origin ||
        destination.pathname !== location.pathname
      )
        return;
      const index = chapters.findIndex(
        (item) => `#${item.anchor}` === destination.hash,
      );
      if (index < 0) return;
      event.preventDefault();
      if (location.hash !== destination.hash)
        history.pushState(null, "", destination.hash);
      goTo(index, true);
    };
    update();
    followHash();
    document.addEventListener("click", followLink, true);
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    preference.addEventListener("change", requestUpdate);
    const observer = new MutationObserver(requestUpdate);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("click", followLink, true);
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("popstate", followHash);
      film?.dispose();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      preference.removeEventListener("change", requestUpdate);
      section.classList.remove("cinema--enhanced");
      layers.forEach((layer) => {
        layer.inert = false;
        layer.removeAttribute("aria-hidden");
      });
    };
  }, [reading, chapters, media]);

  const goTo = (index: number, animate = false) => {
    const section = sectionRef.current;
    if (!section) return;
    if (section.classList.contains("cinema--enhanced")) {
      window.scrollTo({
        top:
          window.scrollY +
          section.getBoundingClientRect().top -
          (document.querySelector("header")?.getBoundingClientRect().height ||
            0) +
          (index / (chapters.length - 1)) *
            (section.offsetHeight -
              (section.querySelector<HTMLElement>(".cinema-stage")
                ?.offsetHeight || window.innerHeight)),
        behavior: animate ? "smooth" : "instant",
      });
    } else
      section
        .querySelectorAll(".cinema-chapter")
        [index]?.scrollIntoView({ behavior: "instant" });
  };

  return (
    <section className="cinema" ref={sectionRef} aria-label="Explore KXRA">
      <div className="cinema-stage">
        {media ? (
          <video
            className="cinema-film"
            ref={videoRef}
            poster={media.poster}
            muted
            playsInline
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : null}
        <div className="cinema-depth-frames" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <canvas className="cinema-world" ref={canvasRef} aria-hidden="true" />
        <div className="cinema-vignette" aria-hidden="true" />
        <div className="cinema-topline">
          <span>
            KXRA <span className="cinema-divider">/</span> THE WALKTHROUGH
          </span>
          {ready ? (
            <button
              type="button"
              onClick={() => setReading(!reading)}
              aria-pressed={reading}
            >
              {reading ? "Enable journey" : "Read without motion"}
            </button>
          ) : null}
        </div>
        <div className="cinema-content">
          {chapters.map((chapter, index) => (
            <article
              className={`cinema-chapter ${chapter.anchor === "platform" ? "cinema-platform-chapter" : ""}`}
              id={`scene-${index + 1}`}
              key={chapter.index}
            >
              <span id={chapter.anchor} className="cinema-anchor" />
              <p className="cinema-kicker">
                {chapter.index} <span /> {chapter.eyebrow}
              </p>
              {index === 0 ? (
                <h1>{chapter.title}</h1>
              ) : (
                <h2>{chapter.title}</h2>
              )}
              <p className="cinema-copy">{chapter.copy}</p>
              <ul className="cinema-tags">
                {chapter.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              {chapter.anchor === "platform" ? <PlatformTour /> : null}
              <div className="actions">
                <a
                  className="button light"
                  href={
                    index === chapters.length - 1
                      ? "#contact"
                      : `#${chapters[index + 1].anchor}`
                  }
                >
                  {index === chapters.length - 1
                    ? "Start a conversation"
                    : "Continue the walkthrough"}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
                {index !== chapters.length - 1 &&
                chapter.anchor !== "platform" ? (
                  <a className="cinema-link" href="#contact">
                    Bring us your business need
                  </a>
                ) : null}
              </div>
              <p className="cinema-note">{chapter.signal}</p>
            </article>
          ))}
        </div>
        <div className="cinema-bottom">
          <span className="cinema-scroll">
            SCROLL TO TRAVEL <span aria-hidden="true">↓</span>
          </span>
          {ready ? (
            <nav className="cinema-nav" aria-label="Journey chapters">
              {chapters.map((chapter, index) => (
                <button
                  type="button"
                  key={chapter.anchor}
                  onClick={() => goTo(index)}
                >
                  <small>{chapter.index}</small> {chapter.label}
                </button>
              ))}
            </nav>
          ) : null}
          <span className="cinema-caption">
            {media
              ? "SEEDANCE 2.5 / ILLUSTRATIVE ENVIRONMENTS"
              : "AN ARCHITECTURAL WORLD OF OPPORTUNITY"}
          </span>
        </div>
        <div className="cinema-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
