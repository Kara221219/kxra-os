"use client";
import { useState } from "react";
export function PlatformTour() {
  const [view, setView] = useState("Rooms");
  const [answer, setAnswer] = useState(false);
  return (
    <aside
      className="platform-tour"
      aria-label="Interactive KXRA OS demonstration"
    >
      <div className="platform-tour-bar">
        <strong>KXRA OS</strong>
        <span>DEMONSTRATION</span>
      </div>
      <div
        className="platform-tour-tabs"
        role="group"
        aria-label="Explore the platform demo"
      >
        {["Rooms", "Agents", "Decisions"].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={view === item}
            onClick={() => {
              setView(item);
              setAnswer(false);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="platform-tour-body" aria-live="polite">
        {view === "Rooms" ? (
          <>
            <p className="demo-title">One place for the next move.</p>
            <div className="demo-task">
              <span className="demo-dot" />
              Customer operations room <small>In review</small>
            </div>
            <div className="demo-task">
              <span className="demo-dot" />
              Client delivery room <small>Next</small>
            </div>
            <div className="demo-task">
              <span className="demo-dot" />
              Private leadership room <small>To approve</small>
            </div>
          </>
        ) : view === "Agents" ? (
          <>
            <p className="demo-title">Choose the model. Define the role.</p>
            <p className="demo-prompt">
              “What needs approval before we begin?”
            </p>
            <button
              type="button"
              className="demo-action"
              onClick={() => setAnswer(true)}
            >
              Show sample answer
            </button>
            {answer ? (
              <p className="demo-answer">
                Agree the scope, price and required inputs before work begins.{" "}
                <span>Source: sample project brief · reviewed example</span>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="demo-title">
              Keep discussions and next steps together.
            </p>
            <p className="demo-prompt">
              Conversation → agent draft → human approval
            </p>
            <div className="demo-creative">
              <span>One workspace.</span>
              <span>Shared context.</span>
              <span>Your approval.</span>
            </div>
          </>
        )}
      </div>
      <p className="platform-tour-note">
        Demonstration · synthetic data · no live AI
      </p>
    </aside>
  );
}
