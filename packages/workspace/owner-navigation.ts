export type OwnerNavigationGroup = {
  title: string;
  primary?: boolean;
  links: readonly (readonly [label: string, path: string])[];
};

// Keep established paths available. Grouping changes presentation, never authority.
export const ownerNavigation: readonly OwnerNavigationGroup[] = [
  {
    title: "Operations",
    primary: true,
    links: [
      ["Overview", ""],
      ["Website enquiries", "enquiries"],
      ["Customer directory", "customer-directory"],
      ["Workspace", "workspace"],
      ["Tasks", "tasks"],
      ["Approvals", "approvals"],
      ["Support & Privacy", "support"],
      ["Work Log", "work-log"],
      ["Admin", "admin"],
    ],
  },
  {
    title: "Workspace tools",
    links: [
      ["Getting started", "start"],
      ["Business Tools", "tools"],
      ["Custom Projects", "custom-projects"],
      ["AI Team", "agents"],
      ["Skills", "skills"],
      ["Routines", "routines"],
      ["Run History", "runs"],
      ["Knowledge", "knowledge"],
      ["Assets", "files"],
      ["Eligibility reviews", "review-operations"],
    ],
  },
  {
    title: "Venture work",
    links: [
      ["Venture overview", "venture-overview"],
      ["Operating Model", "operating-model"],
      ["Improvement Loop", "improvements"],
      ["Portfolio", "portfolio"],
      ["Idea Inbox", "ideas"],
      ["Projects", "projects"],
      ["Research", "sources"],
      ["Experiments", "experiments"],
      ["Decisions", "decisions"],
      ["Risks", "risks"],
      ["Finance", "finance"],
    ],
  },
  {
    title: "Partner operations",
    links: [
      ["Partners", "partners"],
      ["WhatsApp", "whatsapp"],
    ],
  },
];
