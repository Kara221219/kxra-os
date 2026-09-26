"use client";

import { useEffect, useState, type FormEvent } from "react";

type LegalDocument = {
  id: string;
  version: number;
  title: string;
  content_sha256: string;
};

type Proposal = {
  id: string;
  version: number;
  state: string;
  scope: string;
  exclusions: string;
  assumptions: string;
  milestones: { key?: string; title?: string }[];
  proposal_hash: string;
  price_minor: number;
  currency: string;
  tax_treatment: string;
  payment_gate: "NONE" | "DEPOSIT" | "PAID_IN_FULL";
  deposit_minor: number;
  valid_until: string;
  legal_document_version: number;
  accepted: boolean;
  received_minor: number;
  refunded_minor: number;
  delivery_project_id: string | null;
  delivery_project_code: string | null;
  delivery_project_name: string | null;
  changes: {
    id: string;
    version: number;
    state: string;
    scope_delta: string;
    price_delta_minor: number;
    currency: string;
    change_hash: string;
    approvals: { party: "KXRA" | "CUSTOMER"; decision: string }[];
  }[];
  deliveries: {
    id: string;
    milestone_key: string;
    version: number;
    state: string;
    summary: string;
    delivery_hash: string;
  }[];
  invoices: {
    id: string;
    invoice_reference: string;
    subtotal_minor: number;
    tax_minor: number;
    total_minor: number;
    currency: string;
    state: string;
    due_at: string;
  }[];
};

export type CustomProjectRequest = {
  id: string;
  problem: string;
  desired_outcome: string;
  constraints: string;
  state: string;
  reuse_consent: boolean;
  created_at: string;
  proposals: Proposal[];
};

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

async function postJson(path: string, payload: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The action could not be completed");
  return result;
}

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

export function CustomProjectRequestForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await postJson("/api/custom-projects", {
        problem: form.get("problem"),
        desired_outcome: form.get("desired_outcome"),
        constraints: form.get("constraints"),
        reuse_consent: form.get("reuse_consent") === "on",
        request_id: crypto.randomUUID(),
      });
      setMessage("Request submitted privately to KXRA for triage.");
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Request unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" className="panel form-grid" onSubmit={submit}>
      <h2>Request a custom project</h2>
      <p>
        A subscription does not include custom implementation. KXRA will review
        this request and, if suitable, issue a separate scoped proposal.
      </p>
      <label>
        Problem or need
        <textarea name="problem" required maxLength={20000} rows={5} />
      </label>
      <label>
        Desired outcome
        <textarea name="desired_outcome" required maxLength={20000} rows={5} />
      </label>
      <label>
        Constraints, systems or deadlines
        <textarea name="constraints" maxLength={20000} rows={4} />
      </label>
      <label className="check-row">
        <input type="checkbox" name="reuse_consent" />
        KXRA may reuse generalized, nonconfidential learning. This does not
        authorize publication of my project or data.
      </label>
      <button type="submit" disabled={!hydrated || busy}>
        {busy ? "Submitting…" : "Submit private request"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function TriageForm({ requestId }: { requestId: string }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await postJson(`/api/custom-projects/${requestId}/triage`, {
        assessment: form.get("assessment"),
        evidence: [],
        next_state: form.get("next_state"),
      });
      setMessage("Triage decision recorded.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Triage unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" className="form-grid compact-form" onSubmit={submit}>
      <h4>Record KXRA triage</h4>
      <label>
        Assessment
        <textarea name="assessment" required maxLength={20000} rows={3} />
      </label>
      <label>
        Next state
        <select name="next_state" defaultValue="PROPOSAL_PENDING">
          <option value="TRIAGE">Continue triage</option>
          <option value="CLARIFICATION">Customer clarification needed</option>
          <option value="PROPOSAL_PENDING">Ready for proposal</option>
          <option value="REJECTED">Decline request</option>
        </select>
      </label>
      <button disabled={!hydrated || busy}>
        {busy ? "Recording…" : "Record triage"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function ProposalForm({
  requestId,
  legalDocuments,
}: {
  requestId: string;
  legalDocuments: LegalDocument[];
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const legal = legalDocuments.find(
      (item) => `${item.id}:${item.version}` === form.get("legal_document"),
    );
    const milestones = String(form.get("milestones") || "")
      .split("\n")
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title, index) => ({ key: `milestone-${index + 1}`, title }));
    if (!legal || !milestones.length) {
      setMessage("Select approved terms and enter at least one milestone.");
      setBusy(false);
      return;
    }
    try {
      await postJson(`/api/custom-projects/${requestId}/proposals`, {
        scope: form.get("scope"),
        exclusions: form.get("exclusions"),
        assumptions: form.get("assumptions"),
        milestones,
        price_minor: Number(form.get("price_minor")),
        currency: form.get("currency"),
        tax_treatment: form.get("tax_treatment"),
        payment_gate: form.get("payment_gate"),
        deposit_minor: Number(form.get("deposit_minor")),
        legal_document_id: legal.id,
        legal_document_version: legal.version,
        legal_document_sha256: legal.content_sha256,
        valid_until: new Date(String(form.get("valid_until"))).toISOString(),
      });
      setMessage("Exact proposal version issued to the customer.");
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Proposal unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!legalDocuments.length)
    return (
      <p className="notice">
        No approved custom-project terms are available. A placeholder cannot be
        used to issue a proposal.
      </p>
    );
  return (
    <form method="post" className="form-grid compact-form" onSubmit={submit}>
      <h4>Issue a separate proposal</h4>
      <label>
        Scope
        <textarea name="scope" required maxLength={50000} rows={4} />
      </label>
      <label>
        Exclusions
        <textarea name="exclusions" maxLength={30000} rows={2} />
      </label>
      <label>
        Assumptions
        <textarea name="assumptions" maxLength={30000} rows={2} />
      </label>
      <label>
        Milestones, one per line
        <textarea name="milestones" required rows={3} />
      </label>
      <div className="split-fields">
        <label>
          Total in minor units
          <input name="price_minor" type="number" min="0" step="1" required />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue="GBP">
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
      </div>
      <label>
        Tax treatment
        <input name="tax_treatment" required maxLength={500} />
      </label>
      <div className="split-fields">
        <label>
          Payment gate
          <select name="payment_gate" defaultValue="DEPOSIT">
            <option value="NONE">No payment gate</option>
            <option value="DEPOSIT">Deposit required</option>
            <option value="PAID_IN_FULL">Payment in full</option>
          </select>
        </label>
        <label>
          Required deposit in minor units
          <input
            name="deposit_minor"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            required
          />
        </label>
      </div>
      <label>
        Approved custom-project terms
        <select name="legal_document" required defaultValue="">
          <option value="" disabled>
            Select approved terms
          </option>
          {legalDocuments.map((document) => (
            <option
              key={`${document.id}:${document.version}`}
              value={`${document.id}:${document.version}`}
            >
              {document.title} · version {document.version}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valid until
        <input name="valid_until" type="datetime-local" required />
      </label>
      <button disabled={!hydrated || busy}>
        {busy ? "Issuing…" : "Issue exact proposal"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function ProposalActions({
  proposal,
  canManage,
}: {
  proposal: Proposal;
  canManage: boolean;
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await postJson(`/api/custom-projects/proposals/${proposal.id}/accept`, {
        proposal_hash: proposal.proposal_hash,
        request_id: crypto.randomUUID(),
      });
      setMessage("Proposal accepted.");
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Acceptance unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  async function payment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await postJson(`/api/custom-projects/proposals/${proposal.id}/payments`, {
        amount_minor: Number(form.get("amount_minor")),
        currency: proposal.currency,
        state: form.get("state"),
        evidence_reference: form.get("evidence_reference"),
      });
      setMessage("Payment evidence recorded.");
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Payment unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await postJson(`/api/custom-projects/proposals/${proposal.id}/activate`, {
        project_code: form.get("project_code"),
        project_name: form.get("project_name"),
      });
      setMessage("Customer project created with bounded access.");
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Activation unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!canManage && proposal.state === "ISSUED")
    return (
      <form method="post" className="form-grid compact-form" onSubmit={accept}>
        <label className="check-row">
          <input type="checkbox" required />I accept this exact proposal
          version, price, milestones and approved terms.
        </label>
        <button disabled={!hydrated || busy}>
          {busy ? "Accepting…" : `Accept proposal v${proposal.version}`}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    );
  if (!canManage || !["ACCEPTED", "PROJECT_CREATED"].includes(proposal.state))
    return null;
  return (
    <div className="form-grid compact-form">
      <form method="post" className="form-grid" onSubmit={payment}>
        <h5>Record verified payment evidence</h5>
        <div className="split-fields">
          <label>
            Amount in minor units
            <input name="amount_minor" type="number" min="1" required />
          </label>
          <label>
            State
            <select name="state" defaultValue="RECEIVED">
              <option value="PENDING">Pending</option>
              <option value="RECEIVED">Received</option>
              <option value="REFUNDED">Refunded</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
        </div>
        <label>
          Provider, bank or controlled evidence reference
          <input
            name="evidence_reference"
            required
            minLength={3}
            maxLength={500}
          />
        </label>
        <button disabled={!hydrated || busy}>Record payment evidence</button>
      </form>
      {proposal.state === "ACCEPTED" && (
        <form method="post" className="form-grid" onSubmit={activate}>
          <h5>Create delivery workspace</h5>
          <label>
            Project code
            <input
              name="project_code"
              required
              pattern="[A-Z][A-Z0-9-]{2,39}"
            />
          </label>
          <label>
            Project name
            <input name="project_name" required maxLength={240} />
          </label>
          <button disabled={!hydrated || busy}>Create customer project</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function DeliveryLifecycle({
  proposal,
  canManage,
}: {
  proposal: Proposal;
  canManage: boolean;
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const projectId = proposal.delivery_project_id;
  if (!projectId) return null;

  async function run(path: string, payload: unknown, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await postJson(path, payload);
      setMessage(success);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      `/api/custom-projects/projects/${projectId}/changes`,
      {
        scope_delta: form.get("scope_delta"),
        price_delta_minor: Number(form.get("price_delta_minor")),
        currency: proposal.currency,
        request_id: crypto.randomUUID(),
      },
      "Change request submitted for both parties to approve.",
    );
  }
  async function decideChange(
    changeId: string,
    changeHash: string,
    decision: "ACCEPTED" | "REJECTED",
  ) {
    await run(
      `/api/custom-projects/changes/${changeId}/decide`,
      {
        change_hash: changeHash,
        decision,
        note: "Decision recorded in KXRA OS",
      },
      `Change ${decision.toLowerCase()}.`,
    );
  }
  async function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      `/api/custom-projects/projects/${projectId}/deliveries`,
      {
        milestone_key: form.get("milestone_key"),
        summary: form.get("summary"),
        evidence: [{ reference: form.get("evidence_reference") }],
      },
      "Milestone evidence submitted for customer acceptance.",
    );
  }
  async function acceptDelivery(deliveryId: string, deliveryHash: string) {
    await run(
      `/api/custom-projects/deliveries/${deliveryId}/accept`,
      { delivery_hash: deliveryHash },
      "Exact milestone delivery accepted.",
    );
  }
  async function issueInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      `/api/custom-projects/projects/${projectId}/invoices`,
      {
        request_id: crypto.randomUUID(),
        invoice_reference: form.get("invoice_reference"),
        subtotal_minor: Number(form.get("subtotal_minor")),
        tax_minor: Number(form.get("tax_minor")),
        currency: proposal.currency,
        due_at: new Date(String(form.get("due_at"))).toISOString(),
        evidence_reference: form.get("evidence_reference"),
      },
      "Invoice record issued. Payment remains separately verified.",
    );
  }

  const currentParty = canManage ? "KXRA" : "CUSTOMER";
  return (
    <section className="delivery-lifecycle">
      <h4>
        Delivery workspace · {proposal.delivery_project_code} ·{" "}
        {proposal.delivery_project_name}
      </h4>
      <p>
        Scope changes need KXRA and customer approval. Milestone acceptance and
        invoice records do not create or prove payment.
      </p>
      <div className="split-panels">
        <form
          method="post"
          className="form-grid compact-form"
          onSubmit={submitChange}
        >
          <h5>Request a scope change</h5>
          <label>
            Exact scope change
            <textarea name="scope_delta" required maxLength={30000} rows={3} />
          </label>
          <label>
            Price change in minor units
            <input name="price_delta_minor" type="number" step="1" required />
          </label>
          <button disabled={!hydrated || busy}>Submit change request</button>
        </form>
        {canManage && (
          <form
            method="post"
            className="form-grid compact-form"
            onSubmit={submitDelivery}
          >
            <h5>Submit milestone delivery</h5>
            <label>
              Milestone
              <select name="milestone_key" required defaultValue="">
                <option value="" disabled>
                  Select milestone
                </option>
                {proposal.milestones
                  .filter((milestone) => milestone.key)
                  .map((milestone, index) => (
                    <option
                      key={milestone.key || index}
                      value={milestone.key || ""}
                    >
                      {milestone.title || milestone.key}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Delivery summary
              <textarea name="summary" required maxLength={30000} rows={3} />
            </label>
            <label>
              Controlled evidence reference
              <input
                name="evidence_reference"
                required
                minLength={3}
                maxLength={500}
              />
            </label>
            <button disabled={!hydrated || busy}>
              Submit delivery evidence
            </button>
          </form>
        )}
      </div>
      {proposal.changes.map((change) => {
        const alreadyDecided = change.approvals.some(
          (approval) => approval.party === currentParty,
        );
        return (
          <article className="panel" key={change.id}>
            <div className="record-top">
              <h5>Change version {change.version}</h5>
              <span className="badge">{change.state}</span>
            </div>
            <p>{change.scope_delta}</p>
            <p>
              {money(change.price_delta_minor, change.currency)} price change
            </p>
            <small>Exact change {change.change_hash.slice(0, 12)}…</small>
            {change.state === "SUBMITTED" && !alreadyDecided && (
              <div className="button-row">
                <button
                  type="button"
                  disabled={!hydrated || busy}
                  onClick={() =>
                    decideChange(change.id, change.change_hash, "ACCEPTED")
                  }
                >
                  Accept exact change
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!hydrated || busy}
                  onClick={() =>
                    decideChange(change.id, change.change_hash, "REJECTED")
                  }
                >
                  Reject change
                </button>
              </div>
            )}
          </article>
        );
      })}
      {proposal.deliveries.map((delivery) => (
        <article className="panel" key={delivery.id}>
          <div className="record-top">
            <h5>
              {delivery.milestone_key} delivery · version {delivery.version}
            </h5>
            <span className="badge">{delivery.state}</span>
          </div>
          <p>{delivery.summary}</p>
          <small>Exact delivery {delivery.delivery_hash.slice(0, 12)}…</small>
          {!canManage && delivery.state === "SUBMITTED" && (
            <button
              type="button"
              disabled={!hydrated || busy}
              onClick={() =>
                acceptDelivery(delivery.id, delivery.delivery_hash)
              }
            >
              Accept exact milestone delivery
            </button>
          )}
        </article>
      ))}
      {canManage && (
        <form
          method="post"
          className="panel form-grid compact-form"
          onSubmit={issueInvoice}
        >
          <h5>Issue invoice record</h5>
          <div className="split-fields">
            <label>
              Invoice reference
              <input name="invoice_reference" required maxLength={120} />
            </label>
            <label>
              Due at
              <input name="due_at" type="datetime-local" required />
            </label>
          </div>
          <div className="split-fields">
            <label>
              Subtotal in minor units
              <input
                name="subtotal_minor"
                type="number"
                min="0"
                step="1"
                required
              />
            </label>
            <label>
              Tax in minor units
              <input name="tax_minor" type="number" min="0" step="1" required />
            </label>
          </div>
          <label>
            Controlled accounting reference
            <input
              name="evidence_reference"
              required
              minLength={3}
              maxLength={500}
            />
          </label>
          <button disabled={!hydrated || busy}>Issue invoice record</button>
        </form>
      )}
      {proposal.invoices.map((invoice) => (
        <article className="panel" key={invoice.id}>
          <div className="record-top">
            <h5>{invoice.invoice_reference}</h5>
            <span className="badge">{invoice.state}</span>
          </div>
          <p>{money(invoice.total_minor, invoice.currency)} total</p>
          <small>
            Due {new Date(invoice.due_at).toLocaleDateString("en-GB")}
          </small>
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function CustomProjectWorkspace({
  requests,
  canManage,
  legalDocuments,
}: {
  requests: CustomProjectRequest[];
  canManage: boolean;
  legalDocuments: LegalDocument[];
}) {
  return (
    <>
      <CustomProjectRequestForm />
      <div className="record-list">
        {requests.map((request) => (
          <article className="record" key={request.id}>
            <div className="record-top">
              <h3>{request.problem}</h3>
              <span className="badge">{request.state}</span>
            </div>
            <p>{request.desired_outcome}</p>
            {request.constraints && (
              <p>
                <strong>Constraints:</strong> {request.constraints}
              </p>
            )}
            <footer>
              <span>{request.proposals.length} proposal version(s)</span>
              <span>
                {request.reuse_consent
                  ? "Generalized-learning consent recorded"
                  : "No reuse consent"}
              </span>
              <span>
                {new Date(request.created_at).toLocaleDateString("en-GB")}
              </span>
            </footer>
            {request.proposals.map((proposal) => (
              <section className="panel" key={proposal.id}>
                <div className="record-top">
                  <h4>Proposal version {proposal.version}</h4>
                  <span className="badge">{proposal.state}</span>
                </div>
                <p>{proposal.scope}</p>
                <dl className="definition-grid">
                  <div>
                    <dt>Separate price</dt>
                    <dd>{money(proposal.price_minor, proposal.currency)}</dd>
                  </div>
                  <div>
                    <dt>Payment gate</dt>
                    <dd>{proposal.payment_gate.replaceAll("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Payment evidence</dt>
                    <dd>
                      {money(
                        proposal.received_minor - proposal.refunded_minor,
                        proposal.currency,
                      )}{" "}
                      net received
                    </dd>
                  </div>
                  <div>
                    <dt>Valid until</dt>
                    <dd>
                      {new Date(proposal.valid_until).toLocaleString("en-GB")}
                    </dd>
                  </div>
                </dl>
                <p>
                  <strong>Tax:</strong> {proposal.tax_treatment}
                </p>
                {proposal.exclusions && (
                  <p>
                    <strong>Exclusions:</strong> {proposal.exclusions}
                  </p>
                )}
                {proposal.assumptions && (
                  <p>
                    <strong>Assumptions:</strong> {proposal.assumptions}
                  </p>
                )}
                <ol>
                  {proposal.milestones.map((milestone, index) => (
                    <li key={milestone.key || index}>
                      {milestone.title ||
                        milestone.key ||
                        `Milestone ${index + 1}`}
                    </li>
                  ))}
                </ol>
                <small>
                  Exact proposal {proposal.proposal_hash.slice(0, 12)}… · legal
                  version {proposal.legal_document_version}
                </small>
                <ProposalActions proposal={proposal} canManage={canManage} />
                <DeliveryLifecycle proposal={proposal} canManage={canManage} />
              </section>
            ))}
            {canManage &&
              ![
                "ACCEPTED",
                "REJECTED",
                "WITHDRAWN",
                "PROJECT_CREATED",
              ].includes(request.state) && (
                <div className="split-panels">
                  <TriageForm requestId={request.id} />
                  <ProposalForm
                    requestId={request.id}
                    legalDocuments={legalDocuments}
                  />
                </div>
              )}
          </article>
        ))}
        {!requests.length && (
          <div className="empty">No custom project requests yet.</div>
        )}
      </div>
    </>
  );
}
