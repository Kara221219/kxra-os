export const articles = {
  "conversation-to-action": {
    title: "From a conversation to a reviewed next step",
    category: "Guide",
    summary:
      "A useful handoff keeps the reason, the evidence and the responsible person together.",
    sections: [
      [
        "Start with the actual question",
        "A message often contains several things at once: a fact, an assumption, a suggestion and a request. Before turning it into work, separate those parts. Ask what outcome is needed, what evidence is already available and who can make the decision. A clear question is more useful than an elaborate task created from a misunderstanding.",
      ],
      [
        "Keep the source beside the task",
        "The next person should be able to see why the work exists. Keep the relevant conversation, document version or record attached to the proposed action. That does not mean copying every source into a broader room. The handoff must preserve the information boundary as well as the context.",
      ],
      [
        "Name the review point",
        "Preparing a draft, updating an internal record and sending something outside the team are different actions. Say which one is intended. Record the responsible person and the point where they need to review the result. Approval should apply to a specific version, rather than a broad intention that might change later.",
      ],
      [
        "Close the loop with what happened",
        "A queued request is not a completed action, and a lost response is not proof of failure. Record the actual result or the uncertainty that remains. The public workspace sample lets you explore that relationship with fictional records; it does not execute an agent or contact a customer.",
      ],
    ],
    related: ["sample-is-not-connection", "review-before-release"],
  },
  "sample-is-not-connection": {
    title: "A useful sample is not a live connection",
    category: "Product",
    summary:
      "Understand the difference between an interactive explanation, a configured account and accepted operational behavior.",
    sections: [
      [
        "What a sample can show",
        "A public sample can make a workflow concrete. You can see how records relate, move a stage or review a version. Those interactions help a team decide what to build. They do not establish a private account, persistent data or a provider result. Our app examples say explicitly when changes stay in page memory.",
      ],
      [
        "Configuration is a separate state",
        "A directory entry does not mean a provider is supported, and a stored setting does not prove a connection works. A real integration needs an intended account, agreed permissions and a secure setup. Read access should be considered separately from authority to write, send or publish.",
      ],
      [
        "Acceptance includes the difficult cases",
        "A successful first response is only part of the evidence. Review expiry, revocation, denied access, duplicate requests and uncertain delivery. The responsible team needs to know what can be retried and what must be reconciled first. A convincing animation cannot supply that evidence.",
      ],
      [
        "Make the next step specific",
        "Start with one real workflow and agree the expected result. Identify the data, permissions and reviewer it needs. The transition from a sample to an operational application should be a deliberate implementation decision, not an assumption made because a preview looked complete.",
      ],
    ],
    related: ["conversation-to-action", "provider-scope-and-cost"],
  },
  "review-before-release": {
    title: "What should be clear before a workflow goes live?",
    category: "Governance",
    summary:
      "Review the exact work, who can use it and how the team will recover from an unexpected result.",
    sections: [
      [
        "Define the useful outcome",
        "A release should solve a specific problem for an identified team. State the expected behavior and the conditions under which it should be denied. Keep the agreed scope separate from attractive ideas for later. This makes acceptance a decision about evidence rather than a general feeling that the work is ready.",
      ],
      [
        "Check ownership and access",
        "Confirm the responsible organisation, workspace and people. A person’s ability to open one page does not establish permission to read every room or act on every account. The implementation needs to respect current membership and source permissions when a request is made.",
      ],
      [
        "Prove persistence and recovery",
        "A useful result must still be there when the user returns. Test the handoff across sign-out and a new session, and consider what happens if the process stops halfway through. Recovery should preserve the work already accepted and distinguish an uncertain external effect from a safe retry.",
      ],
      [
        "Keep authority explicit",
        "The exact version, configuration and release decision belong together. Publishing a website does not authorise a payment, a provider connection or an external message. Agree those actions in their own context. Our public guides explain these boundaries; they are not evidence that every hosted workflow has passed them.",
      ],
    ],
    related: ["sample-is-not-connection", "conversation-to-action"],
  },
  "provider-scope-and-cost": {
    title: "Bring a model with a clear scope",
    category: "Guide",
    summary:
      "Provider choice is only one part of deciding how an agent may work.",
    sections: [
      [
        "Start with the task",
        "Choose a provider around the work and the information it needs, rather than assuming one model is right for every task. Describe the desired result, the evidence available and the review boundary. A model’s output should remain a draft when the result has not been checked.",
      ],
      [
        "Review the data boundary",
        "Decide what may leave the workspace and under which provider terms. Credentials must stay out of prompts, public forms and source code. A task should receive only the context it may use; permission to connect an account is not authority to expose every record in it.",
      ],
      [
        "Agree usage before execution",
        "Keep provider charges separate from a workspace offer or an implementation quote. The responsible person should understand what is authorised and what happens when the agreed boundary is reached. Unknown cost is still unknown; it should not be presented as an accepted spend or an invoice.",
      ],
      [
        "Verify the real path",
        "A protocol test with synthetic responses is useful engineering evidence, but it does not prove a live provider connection. Review a real permitted result, errors and revocation before describing the workflow as operational. No provider is activated by reading this guide.",
      ],
    ],
    related: ["sample-is-not-connection", "review-before-release"],
  },
} as const;
export type ArticleKey = keyof typeof articles;
export const articleKeys = Object.keys(articles) as ArticleKey[];
export function readingMinutes(key: ArticleKey) {
  return Math.max(
    1,
    Math.ceil(
      articles[key].sections
        .map((s) => s.join(" "))
        .join(" ")
        .split(/\s+/).length / 200,
    ),
  );
}
