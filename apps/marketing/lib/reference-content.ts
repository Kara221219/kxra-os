export const productPages = {
  workspace: {
    title: "Your work, in one shared workspace.",
    summary:
      "Organise rooms, conversations, files and decisions around the people doing the work.",
    steps: [
      "Create a room for a team or project.",
      "Choose the members and the context they can use.",
      "Keep the conversation, evidence and next step together.",
    ],
  },
  agents: {
    title: "A clear role for every agent.",
    summary:
      "Give an agent an explicit job, selected context and a review boundary.",
    steps: [
      "Describe the role and desired outcome.",
      "Select the permitted room, sources and tools.",
      "Review the draft and its recorded evidence.",
    ],
  },
  access: {
    title: "The right people. The right context.",
    summary:
      "Keep workspace membership, room access and approval authority explicit.",
    steps: [
      "Verify the account and select a workspace.",
      "Grant the minimum access needed for the role.",
      "Remove access when the engagement ends.",
    ],
  },
  approvals: {
    title: "Make the decision before the action.",
    summary:
      "Review a specific version of work before authorising its next step.",
    steps: [
      "Inspect the proposed action and evidence.",
      "Check scope, version and consequences.",
      "Approve or reject with an auditable decision.",
    ],
  },
  memory: {
    title: "Useful context, with a source.",
    summary:
      "Keep reviewed knowledge connected to its origin and permission boundary.",
    steps: [
      "Choose the source material.",
      "Review what should be retained and where.",
      "Withdraw or update context when the source changes.",
    ],
  },
  models: {
    title: "Choose the model for the work.",
    summary:
      "Keep model choice, provider cost and data handling visible before execution.",
    steps: [
      "Choose an approved provider and model.",
      "Review the context and usage boundary.",
      "Accept a real result only after the configured path is verified.",
    ],
  },
  workflows: {
    title: "A repeatable way through the work.",
    summary:
      "Describe the trigger, responsible people and review gates for a recurring process.",
    steps: [
      "Define the input and expected outcome.",
      "Choose the steps and required approvals.",
      "Review failures, retries and completion evidence.",
    ],
  },
  skills: {
    title: "Keep useful ways of working.",
    summary:
      "Turn a reviewed process into versioned instructions your team can reuse.",
    steps: [
      "Write a bounded task and required evidence.",
      "Review the instructions and permitted tools.",
      "Reuse the approved version and improve it deliberately.",
    ],
  },
  tools: {
    title: "Useful tools, deliberately connected.",
    summary:
      "Connect a capability to an agreed task and a specific access boundary.",
    steps: [
      "Identify the tool and the operation.",
      "Review its permissions and external effects.",
      "Verify real acceptance before calling it operational.",
    ],
  },
  credentials: {
    title: "Connections stay within their boundary.",
    summary:
      "A provider secret is authority. Keep it out of prompts, public pages and source control.",
    steps: [
      "Review the provider, account and required scope.",
      "Use an authorised secure handoff for credentials.",
      "Rotate or revoke access and verify subsequent use is denied.",
    ],
  },
  sandbox: {
    title: "Try a change before it becomes live.",
    summary:
      "Keep drafts, preview records and release decisions separate from operational data.",
    steps: [
      "Prepare a candidate with a clear data and execution boundary.",
      "Test the intended result and the denied or uncertain cases.",
      "Review the exact version, recovery and rollback before release.",
    ],
  },
  "build-and-ship": {
    title: "From an idea to a reviewed release.",
    summary:
      "Keep the specification, implementation evidence and release decision connected.",
    steps: [
      "Define the smallest useful outcome and acceptance checks.",
      "Build in an isolated candidate and verify real persistence where required.",
      "Approve the exact artifact and configuration before publication.",
    ],
  },
  "run-history": {
    title: "See what happened, and why.",
    summary:
      "Keep the request, permitted evidence, review events and actual outcome in view.",
    steps: [
      "Locate the request or run without broadening private access.",
      "Distinguish planned, queued, dispatched, completed and uncertain states.",
      "Reconcile an external outcome before repeating a potentially completed action.",
    ],
  },
  usage: {
    title: "Know the boundary before work starts.",
    summary:
      "Keep provider costs, workspace scope and actual usage distinct from a proposed subscription.",
    steps: [
      "Review the approved scope and the provider’s own terms.",
      "Agree the usage boundary and any authorised spend before execution.",
      "Reconcile actual work; an estimate is not an invoice or entitlement.",
    ],
  },
  "data-scoping": {
    title: "Context follows permission.",
    summary:
      "A task may use only the room and source material its requester is allowed to access.",
    steps: [
      "Confirm the verified workspace and room membership.",
      "Select permitted sources and keep their provenance.",
      "Recheck access after membership removal, source withdrawal or scope changes.",
    ],
  },
} as const;
export const appTemplates = [
  {
    name: "General CRM",
    topic: "Sales",
    summary:
      "Keep leads separate from qualified opportunities, with an owner and next action.",
  },
  {
    name: "Creator Management",
    topic: "Marketing",
    summary:
      "Organise creator records, content plans and reviewed outreach drafts.",
  },
  {
    name: "Sampling Desk",
    topic: "Operations",
    summary:
      "Track samples, delivery windows and the next responsible follow-up.",
  },
  {
    name: "Remodeling CRM",
    topic: "Projects",
    summary:
      "Connect the customer, property, versioned scope and review milestones.",
  },
  {
    name: "Recruiting Workspace",
    topic: "Hiring",
    summary:
      "Keep candidate applications, stage decisions and confidential reviews distinct.",
  },
  {
    name: "Travel Desk",
    topic: "Operations",
    summary:
      "Keep enquiries, proposals, approvals and booking evidence in one workflow.",
  },
];
