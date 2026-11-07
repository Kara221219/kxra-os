"use client";
import { useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import {
  pairedSetupPrewriteRejection,
  PairedSetupPrewriteError,
} from "../../../packages/workspace/paired-setup-response";
import type { pairedSetupCommand } from "../../../packages/workspace/paired-setup-contract";
import {
  parsePairedSetupOptions,
  parsePairedSetupReceipt,
  type PairedSetupOptions,
  type PairedSetupReceipt,
} from "../../../packages/workspace/paired-setup-client-contract";
type Options = PairedSetupOptions;
type Receipt = PairedSetupReceipt;
type Command = z.infer<typeof pairedSetupCommand>;
const explanations: Record<Receipt["reason"], string> = {
  POLICY_READY_SETUP_HELD: "Reviews are current. Setup remains paused.",
  SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED:
    "Provider confirmation is still needed for subscription use.",
  TRANSPORT_REVIEW_REQUIRED:
    "A separate review of the local agent connection is needed.",
  TERMS_REQUIRED: "Accept the current workspace terms before continuing.",
  PAID_PROOF_REQUIRED: "Current paid access could not be confirmed.",
  BUSINESS_REVIEW_REQUIRED: "A current business review is needed.",
  AI_REVIEW_REQUIRED: "This AI model request still needs review.",
  NEW_REQUEST_REQUIRED:
    "The reviews changed. Prepare a new request when ready.",
  EXPIRED: "This request expired. Prepare a new request when ready.",
  CANCELLED: "This request is cancelled.",
};
export function PairedSetupForm({ initial }: { initial: Options }) {
  const [options, setOptions] = useState(initial),
    [receipts, setReceipts] = useState<Record<string, Receipt>>({}),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Command | null>(null),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function post(command: Command | { action: "OPTIONS" }) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    let value: unknown;
    try {
      const response = await fetch("/api/paired-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
        cache: "no-store",
        signal: controller.signal,
      });
      value = await response.json();
      if (!response.ok) {
        const code = pairedSetupPrewriteRejection(response.status, value);
        if (code) throw new PairedSetupPrewriteError(code);
        throw Error("UNCONFIRMED");
      }
    } finally {
      clearTimeout(timer);
    }
    if (command.action === "OPTIONS") return parsePairedSetupOptions(value);
    const receipt = parsePairedSetupReceipt(value);
    if (
      receipt.request_id !== command.request_id ||
      (command.action === "REQUEST" && receipt.room_id !== command.room_id) ||
      (command.action === "STATUS" &&
        pending?.action === "REQUEST" &&
        pending.request_id === command.request_id &&
        receipt.room_id !== pending.room_id)
    )
      throw Error("FOREIGN_RECEIPT");
    return receipt;
  }
  async function act(command: Command) {
    if (lock.current || (pending && command.action !== "STATUS")) return;
    const recovery =
      pending?.request_id === command.request_id ? pending : null;
    lock.current = true;
    setBusy(true);
    setNotice("");
    if (command.action !== "STATUS") setPending(command);
    try {
      const result = (await post(command)) as Receipt;
      setReceipts((previous) => ({ ...previous, [result.request_id]: result }));
      setPending((previous) =>
        previous?.request_id === result.request_id ? null : previous,
      );
      setNotice(explanations[result.reason]);
      const label =
        command.action === "REQUEST"
          ? command.label
          : recovery?.action === "REQUEST"
            ? recovery.label
            : undefined;
      if (label)
        setOptions((previous) => ({
          ...previous,
          requests: [
            {
              id: result.request_id,
              agent_id: result.agent_id,
              room_id: result.room_id,
              label,
            },
            ...previous.requests.filter((r) => r.id !== result.request_id),
          ].slice(0, 20),
        }));
    } catch (error) {
      if (error instanceof PairedSetupPrewriteError) {
        // A rejected STATUS says nothing about an earlier unknown write.
        if (command.action !== "STATUS") setPending(null);
        setNotice(
          error.code === "IDENTITY_REQUIRED"
            ? "A current session and recent MFA check are required. Sign in again, then reopen this page."
            : command.action === "STATUS"
              ? "Status could not be checked. The earlier request remains on hold."
              : "This request was not submitted. Refresh the page before trying again.",
        );
        return;
      }
      setNotice(
        command.action === "STATUS"
          ? "Status could not be confirmed. Keep this request on hold."
          : "The outcome is unknown. Check this request’s status before trying again.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || lock.current) return;
    const form = new FormData(event.currentTarget);
    void act({
      action: "REQUEST",
      request_id: crypto.randomUUID(),
      room_id: String(form.get("room")),
      ai_intent_id: String(form.get("ai")),
      auth_route:
        form.get("route") === "CHATGPT_SUBSCRIPTION"
          ? "CHATGPT_SUBSCRIPTION"
          : "CUSTOMER_API_KEY",
      label: String(form.get("label")).trim(),
    });
  }
  return (
    <section aria-label="Private agent setup" aria-busy={busy}>
      <form onSubmit={submit} className="workflow-form">
        <fieldset disabled={busy || !!pending}>
          <legend>New setup request</legend>
          <div className="form-grid">
            <div>
              <label htmlFor="paired-setup-name">Private agent name</label>
              <input
                id="paired-setup-name"
                name="label"
                required
                minLength={1}
                maxLength={100}
                defaultValue="My private agent"
              />
            </div>
            <div>
              <label htmlFor="paired-setup-room">Room</label>
              <select
                id="paired-setup-room"
                name="room"
                required
                defaultValue={options.rooms[0]?.id ?? ""}
              >
                {options.rooms.length ? (
                  options.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))
                ) : (
                  <option value="">No authorised room</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="paired-setup-ai">AI model request</label>
              <select
                id="paired-setup-ai"
                name="ai"
                required
                defaultValue={options.ai_intents[0]?.id ?? ""}
              >
                {options.ai_intents.length ? (
                  options.ai_intents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.model} · {a.id.slice(0, 8)}
                    </option>
                  ))
                ) : (
                  <option value="">No AI model request</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="paired-setup-route">AI account route</label>
              <select
                id="paired-setup-route"
                name="route"
                defaultValue="CUSTOMER_API_KEY"
              >
                <option value="CUSTOMER_API_KEY">
                  Customer API key · review required
                </option>
                <option value="CHATGPT_SUBSCRIPTION">
                  ChatGPT subscription · confirmation required
                </option>
              </select>
            </div>
          </div>
          <p>No key or sign-in is requested here.</p>
          <button
            disabled={!options.rooms.length || !options.ai_intents.length}
          >
            Save setup request
          </button>
        </fieldset>
      </form>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {pending ? (
        <div className="workflow-task" aria-label="Unconfirmed request">
          <p>This request remains on hold until its outcome is confirmed.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act({ action: "STATUS", request_id: pending.request_id })
            }
          >
            Check request status
          </button>
        </div>
      ) : null}
      <h2>Saved requests</h2>
      {options.requests.length ? (
        options.requests.map((r) => {
          const receipt = receipts[r.id],
            finished =
              receipt?.reason === "CANCELLED" || receipt?.reason === "EXPIRED";
          return (
            <article
              className="workflow-task"
              key={r.id}
              aria-label={"Setup request " + r.label}
            >
              <h3>{r.label}</h3>
              <p>
                {receipt
                  ? explanations[receipt.reason]
                  : "Check the current status before continuing."}
              </p>
              <p>Agent disabled · no credentials issued</p>
              {receipt ? (
                <p>
                  Request expiry:{" "}
                  <time dateTime={receipt.expires_at}>
                    {new Date(receipt.expires_at).toLocaleString()}
                  </time>
                </p>
              ) : null}
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act({ action: "STATUS", request_id: r.id })
                  }
                >
                  Refresh status
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || finished || !!pending}
                  onClick={() =>
                    void act({ action: "CANCEL", request_id: r.id })
                  }
                >
                  Cancel request
                </button>
              </div>
            </article>
          );
        })
      ) : (
        <p>No setup requests saved yet.</p>
      )}
    </section>
  );
}
