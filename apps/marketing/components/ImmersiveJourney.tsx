"use client";

import { useEffect, useRef } from "react";

export type JourneyChapter = {
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
  tags: readonly string[];
  signal: string;
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ImmersiveJourney({
  chapters,
}: {
  chapters: readonly JourneyChapter[];
}) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (
      !section ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const stage = section.querySelector<HTMLElement>(".journey-stage");
    const layers = Array.from(
      section.querySelectorAll<HTMLElement>(".journey-chapter"),
    );
    if (!stage || layers.length === 0) return;

    section.classList.add("journey--enhanced");
    let frame = 0;

    const update = () => {
      frame = 0;
      const bounds = section.getBoundingClientRect();
      const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-bounds.top / distance);
      const chapterPosition = progress * (layers.length - 1);

      stage.style.setProperty("--journey-progress", progress.toFixed(4));
      layers.forEach((layer, chapterIndex) => {
        const delta = chapterIndex - chapterPosition;
        const distanceFromCamera = Math.abs(delta);
        const passed = delta < 0;
        const z = passed ? distanceFromCamera * 760 : -distanceFromCamera * 880;
        const y = passed ? -distanceFromCamera * 7 : distanceFromCamera * 8;
        const x = delta * 3.2;
        const opacity = clamp(1 - distanceFromCamera * 0.72, 0, 1);
        const blur = Math.max(0, distanceFromCamera - 0.28) * 5;

        layer.style.setProperty("--chapter-z", `${z.toFixed(1)}px`);
        layer.style.setProperty("--chapter-x", `${x.toFixed(2)}vw`);
        layer.style.setProperty("--chapter-y", `${y.toFixed(2)}vh`);
        layer.style.setProperty("--chapter-opacity", opacity.toFixed(3));
        layer.style.setProperty("--chapter-blur", `${blur.toFixed(2)}px`);
        layer.dataset.active = distanceFromCamera < 0.52 ? "true" : "false";
      });
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      section.classList.remove("journey--enhanced");
    };
  }, []);

  return (
    <section
      className="journey"
      ref={sectionRef}
      aria-labelledby="journey-title"
    >
      <div className="journey-stage">
        <div className="journey-grid" aria-hidden="true" />
        <div className="journey-circuit circuit-one" aria-hidden="true" />
        <div className="journey-circuit circuit-two" aria-hidden="true" />
        <div className="depth-portal" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <span>KXRA</span>
        </div>
        <div className="journey-heading">
          <p className="eyebrow">A journey through business</p>
          <h2 id="journey-title">Move through the opportunity.</h2>
          <p>Scroll to travel deeper into the KXRA operating model.</p>
        </div>
        <div className="journey-chapters">
          {chapters.map((chapter) => (
            <article className="layer journey-chapter" key={chapter.index}>
              <div className="chapter-number" aria-hidden="true">
                {chapter.index}
              </div>
              <div className="chapter-copy">
                <p className="layer-index">PLANE {chapter.index}</p>
                <p className="chapter-eyebrow">{chapter.eyebrow}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.copy}</p>
                <ul className="layer-tags">
                  {chapter.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </div>
              <div className="chapter-signal" aria-label={chapter.signal}>
                <span />
                {chapter.signal}
              </div>
            </article>
          ))}
        </div>
        <div className="journey-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
