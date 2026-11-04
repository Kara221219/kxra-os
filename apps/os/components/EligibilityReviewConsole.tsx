"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isReviewId,
  parseReviewDetail,
  parseReviewQueue,
  parseReviewReceipt,
  type ReviewDetail,
  type ReviewQueue,
} from "../../../packages/review-operations/public";
const reasons: Record<ReviewDetail["reason"], string> = {
  REPLACEMENT_REQUIRES_AUTHORITY:
    "This subject already has a decision. Replacing it needs an explicit grant and can stop existing customer connections; it is not automatic renewal.",
  READY:
    "The recorded prerequisites are current. Check independent evidence before recording any decision.",
  BILLING_OR_TERMS_REQUIRED:
    "Verified billing binding, approved terms or current applicant authority is missing. Resolve the prerequisite and open a new request.",
  SAVED_REQUIRES_NEW_INTENT:
    "A saved connection cannot be renewed by replacing its review. The customer needs a new reviewed connection; withdrawal remains a separate operation.",
  INTENT_EXPIRED:
    "This setup intent expired. The customer needs a new reference.",
  BUSINESS_OR_ACCOUNT_REVIEW_REQUIRED:
    "Current business review or customer account authority is missing. Do not record clearance.",
};
async function response(r: Response) {
  const body = await r.json();
  if (
    !r.ok ||
    !body ||
    typeof body !== "object" ||
    Object.keys(body).join(",") !== "result"
  )
    throw Error("Review unavailable");
  return body.result as unknown;
}
export default function EligibilityReviewConsole() {
  const [queue, setQueue] = useState<ReviewQueue>({
      items: [],
      next_cursor: null,
    }),
    [detail, setDetail] = useState<ReviewDetail | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [operationId, setOperationId] = useState("");
  const inFlight = useRef(false),
    manual = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null);
  const resetOnFailure = useCallback(() => {
    setDetail(null);
    setQueue({ items: [], next_cursor: null });
    setOperationId("");
    setNotice(
      "Review access or the response could not be confirmed. Refresh with current reviewer access and MFA. No automatic decision retry was made.",
    );
  }, []);
  const load = useCallback(
    async (after?: string) => {
      controller.current?.abort();
      const control = new AbortController();
      controller.current = control;
      setBusy(true);
      setNotice("");
      try {
        const q = parseReviewQueue(
          await response(
            await fetch(
              "/api/review-operations" +
                (after ? "?after=" + encodeURIComponent(after) : ""),
              { cache: "no-store", signal: control.signal },
            ),
          ),
        );
        if (!control.signal.aborted) {
          setQueue(q);
          setDetail(null);
          setOperationId("");
        }
      } catch {
        if (!control.signal.aborted) resetOnFailure();
      } finally {
        if (!control.signal.aborted) setBusy(false);
      }
    },
    [resetOnFailure],
  );
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  async function open(item: ReviewDetail) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const d = parseReviewDetail(
        await response(
          await fetch("/api/review-operations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "OPEN",
              kind: item.kind,
              subject_id: item.subject_id,
            }),
          }),
        ),
      );
      setDetail(d);
      setOperationId(crypto.randomUUID());
    } catch {
      resetOnFailure();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function view(id: string) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const d = parseReviewDetail(
        await response(
          await fetch(
            "/api/review-operations?request_id=" + encodeURIComponent(id),
            { cache: "no-store" },
          ),
        ),
      );
      setDetail(d);
      setOperationId(crypto.randomUUID());
    } catch {
      resetOnFailure();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function submit(form: HTMLFormElement, withdraw: boolean) {
    if (
      inFlight.current ||
      busy ||
      !detail?.request_id ||
      !detail.request_current ||
      !operationId
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    const f = new FormData(form),
      decision: Record<string, string> = {};
    const requestId = detail.request_id;
    try {
      if (!withdraw) {
        decision.expires_at = new Date(
          String(f.get("expires_at")),
        ).toISOString();
        if (detail.kind === "BUSINESS") {
          for (const name of ["legal", "payment", "provider", "tax"]) {
            decision[name + "_status"] = String(f.get(name + "_status"));
            decision[name + "_evidence_sha256"] = String(
              f.get(name + "_evidence_sha256"),
            );
          }
        } else
          for (const name of [
            "state",
            "account_mode",
            "account_reference_sha256",
            "provider_evidence_sha256",
          ])
            decision[name] = String(f.get(name));
      }

      parseReviewReceipt(
        await response(
          await fetch("/api/review-operations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: withdraw ? "WITHDRAW" : "DECIDE",
              request_id: requestId,
              operation_id: operationId,
              decision,
              attested: f.get("attested") === "on",
            }),
          }),
        ),
      );
      const d = parseReviewDetail(
        await response(
          await fetch(
            "/api/review-operations?request_id=" +
              encodeURIComponent(requestId),
            { cache: "no-store" },
          ),
        ),
      );
      setDetail(d);
      setOperationId("");
      form.reset();
      setNotice(
        "Receipt recorded. It is not payment or provider acceptance. Current customer eligibility is checked independently.",
      );
    } catch {
      setDetail({
        ...detail,
        request_current: false,
        can_decide: false,
        can_withdraw: false,
      });
      setNotice(
        "Outcome not confirmed. Keep request " +
          requestId +
          " and operation " +
          operationId +
          ". Check the request before any further action; do not submit a replacement decision.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Independent eligibility review">
      <p>
        Only customers and review types covered by your current, explicit grant
        appear. Never paste API keys, raw identity documents or customer
        messages here. Evidence digests identify the independently reviewed
        record; a digest alone proves nothing.
      </p>
      <button type="button" disabled={busy} onClick={() => void load()}>
        Refresh review queue
      </button>
      {queue.next_cursor && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(queue.next_cursor!)}
        >
          Next review page
        </button>
      )}
      <label>
        Review request reference
        <input ref={manual} autoComplete="off" maxLength={36} />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const id = manual.current?.value.trim();
          if (isReviewId(id)) void view(id);
          else setNotice("Enter a valid request reference.");
        }}
      >
        Check review request
      </button>
      <p role="status">{busy ? "Checking current authority…" : notice}</p>
      {!busy && queue.items.length === 0 && (
        <p>No review subjects are available under your current grants.</p>
      )}
      {queue.items.map((i) => (
        <article className="panel" key={i.kind + ":" + i.subject_id}>
          <h2>
            {i.organization_name} ·{" "}
            {i.kind === "BUSINESS" ? "Business review" : "AI connection review"}
          </h2>
          <p>
            {i.provider}
            {i.model ? " · " + i.model : ""} · {i.country}
          </p>
          <p>{reasons[i.reason]}</p>
          <button disabled={busy} type="button" onClick={() => void open(i)}>
            Open exact review · {i.subject_id}
          </button>
        </article>
      ))}
      {detail && (
        <article className="panel" style={{ overflowWrap: "anywhere" }}>
          <h2>Exact review request</h2>
          <p>
            Reference: <code>{detail.request_id}</code>
          </p>
          <p>
            {detail.organization_name} · {detail.legal_name} · {detail.country}{" "}
            · {detail.region}
          </p>
          <p>
            {detail.kind} · {detail.provider}
            {detail.model ? " · " + detail.model : ""}
            {detail.endpoint_id ? " · " + detail.endpoint_id : ""}
          </p>
          <p>Policy version: {detail.policy_version}</p>
          <p>{reasons[detail.reason]}</p>
          <p>Request deadline: {detail.expires_at}</p>
          {detail.receipt && (
            <p role="status">
              Recorded receipt: {detail.receipt.operation_id} ·{" "}
              {detail.receipt.state}. This is a historical decision receipt, not
              current payment or provider authority.
            </p>
          )}
          {!detail.request_current && (
            <p>
              This request is completed, changed or expired. Check its receipt.
              A new review requires opening the current subject again.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void open(detail)}
          >
            Open current subject again
          </button>
          {detail.request_current && detail.can_decide && !detail.receipt && (
            <form
              key={detail.request_id}
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget, false);
              }}
            >
              <fieldset disabled={busy}>
                <legend>Record independent review</legend>
                <p>
                  Check the exact subject and approved policy against evidence
                  outside this console. Nothing is pre-cleared.
                </p>
                {detail.kind === "BUSINESS" ? (
                  ["legal", "payment", "provider", "tax"].map((name) => (
                    <div key={name}>
                      <label>
                        {name} finding
                        <select
                          name={name + "_status"}
                          defaultValue="REVIEW_REQUIRED"
                        >
                          <option>REVIEW_REQUIRED</option>
                          <option>CLEARED</option>
                          <option>BLOCKED</option>
                        </select>
                      </label>
                      <label>
                        {name} reviewed evidence SHA-256
                        <input
                          name={name + "_evidence_sha256"}
                          required
                          pattern="[a-f0-9]{64}"
                          minLength={64}
                          maxLength={64}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  ))
                ) : (
                  <>
                    <label>
                      AI finding
                      <select name="state" defaultValue="REVIEW_REQUIRED">
                        <option>REVIEW_REQUIRED</option>
                        <option>ELIGIBLE</option>
                        <option>BLOCKED</option>
                      </select>
                    </label>
                    <label>
                      Reviewed account mode
                      <select name="account_mode" defaultValue="UNKNOWN">
                        <option>UNKNOWN</option>
                        <option>CUSTOMER_BILLED</option>
                        <option>GOOGLE_PAID</option>
                      </select>
                    </label>
                    <label>
                      Reviewed account reference SHA-256
                      <input
                        name="account_reference_sha256"
                        required
                        pattern="[a-f0-9]{64}"
                        minLength={64}
                        maxLength={64}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Provider reviewed evidence SHA-256
                      <input
                        name="provider_evidence_sha256"
                        required
                        pattern="[a-f0-9]{64}"
                        minLength={64}
                        maxLength={64}
                        autoComplete="off"
                      />
                    </label>
                  </>
                )}
                <label>
                  Decision valid until (your local time)
                  <input type="datetime-local" name="expires_at" required />
                </label>
                <p>
                  The server caps validity to your grant and approved policy.
                  This form does not change retention or renewal commitments.
                </p>
                <label>
                  <input name="attested" type="checkbox" required /> I
                  independently reviewed this exact request under the named
                  policy and am authorised to record these findings.
                </label>
                <button type="submit">Record exact decision</button>
              </fieldset>
            </form>
          )}
          {detail.request_current && detail.can_withdraw && !detail.receipt && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(e.currentTarget, true);
              }}
            >
              <fieldset disabled={busy}>
                <legend>Withdraw current review</legend>
                <p>
                  Current review: {detail.prior_review?.id}. Withdrawal can stop
                  customer eligibility; it cannot recall an external request
                  already accepted.
                </p>
                <label>
                  <input type="checkbox" name="attested" required /> I am
                  authorised to withdraw this exact review and have verified the
                  scope and consequence.
                </label>
                <button type="submit">Withdraw exact review</button>
              </fieldset>
            </form>
          )}
        </article>
      )}
    </section>
  );
}
