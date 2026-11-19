export const insights = [
  {
    slug: "shared-rooms",
    title: "A room keeps the work in one place",
    summary:
      "People and agents share a room. Membership decides who can read it. A model does not grant access.",
    sections: [
      {
        heading: "What a room is",
        body: "A room belongs to one organisation and one project. Messages, drafts, tasks and approvals stay in that room. An owner who is not a member of a private room does not see its messages.",
      },
      {
        heading: "What an agent can do there",
        body: "An agent can draft from the messages and files already shared into the room. The draft is text. It does not send email, move money, or change who is allowed in.",
      },
    ],
  },
  {
    slug: "bring-your-own-model",
    title: "You pay your model provider, not KXRA, for the model",
    summary:
      "Workspace price does not include model credits. A saved key is not the same as a working connection.",
    sections: [
      {
        heading: "Which connections exist in the product",
        body: "The app can store a customer key for OpenAI, Anthropic, Google, OpenRouter, or an operator-approved compatible endpoint. The key is encrypted. Each run checks permission again before a call.",
      },
      {
        heading: "What is not included",
        body: "KXRA does not sell a pool of model credits, and it does not claim thousands of ready-made integrations. A key that is saved can still fail if the provider rejects it or the run is not authorised.",
      },
    ],
  },
  {
    slug: "decision-review",
    title: "Decision Review is a service, not an automatic answer",
    summary:
      "You ask for a review of one decision. KXRA scopes it, you can pay the published price, and you can track the request.",
    sections: [
      {
        heading: "What you get",
        body: "One decision, up to three options, a recommendation, and a 30-minute walkthrough. The published price is £250. VAT is not added. Work starts after the request is accepted, not when the form is sent.",
      },
      {
        heading: "What the form does",
        body: "The public form records an unverified request. It does not create a paid order by itself. Payment follows the same checkout rules as the rest of the product: test cards until live Stripe keys are switched on by the owner.",
      },
    ],
  },
  {
    slug: "approvals",
    title: "A person approves before something leaves the room",
    summary:
      "Consequential actions wait for a current approval. An old approval does not survive a later revocation.",
    sections: [
      {
        heading: "What is recorded",
        body: "An approval names the action, the person, the project, and the version it applies to. Two attempts at the same approval do not apply twice. Rejected, expired and already-used approvals fail.",
      },
      {
        heading: "What this does not promise",
        body: "Approving a draft does not send it. Approving a subscription change does not refund a card. Refunds are done in Stripe, not from a button in the admin screen.",
      },
    ],
  },
] as const;

export function insight(slug: string) {
  return insights.find((item) => item.slug === slug);
}
