"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { drawJourneyWorld } from "./JourneyWorld";

export type JourneyChapter = {
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
  tags: readonly string[];
  signal: string;
};

export function ImmersiveJourney({
  chapters,
}: {
  chapters: readonly JourneyChapter[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    let frame = 0;
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
    update();
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
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      preference.removeEventListener("change", requestUpdate);
      section.classList.remove("cinema--enhanced");
      layers.forEach((layer) => {
        layer.inert = false;
        layer.removeAttribute("aria-hidden");
      });
    };
  }, [reading, chapters]);

  const goTo = (index: number) => {
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
        behavior: "instant",
      });
    } else
      section
        .querySelectorAll(".cinema-chapter")
        [index]?.scrollIntoView({ behavior: "instant" });
  };

  return (
    <section className="cinema" ref={sectionRef} aria-label="Explore KXRA">
      <div className="cinema-stage">
        <canvas className="cinema-world" ref={canvasRef} aria-hidden="true" />
        <div className="cinema-vignette" aria-hidden="true" />
        <div className="cinema-topline">
          <span>
            KXRA GROUP <span className="cinema-divider">/</span> POSSIBILITIES,
            CONNECTED.
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
              className="cinema-chapter"
              id={`scene-${index + 1}`}
              key={chapter.index}
            >
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
              <div className="actions">
                <Link
                  className="button light"
                  href={index === 3 ? "/contact" : "/submit-opportunity"}
                >
                  {index === 3
                    ? "Start a conversation"
                    : "Bring us your business need"}{" "}
                  <span aria-hidden="true">↗</span>
                </Link>
                <Link className="cinema-link" href="/platform">
                  Explore KXRA OS →
                </Link>
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
              {[
                "Possibility",
                "Industries",
                "Capability",
                "Your next move",
              ].map((label, index) => (
                <button type="button" key={label} onClick={() => goTo(index)}>
                  <small>0{index + 1}</small> {label}
                </button>
              ))}
            </nav>
          ) : null}
          <span className="cinema-caption">
            AN ILLUSTRATED WORLD OF OPPORTUNITY
          </span>
        </div>
        <div className="cinema-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
