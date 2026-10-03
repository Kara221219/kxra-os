export const releaseReviewPackets = {
  ACCESSIBILITY: {
    title: "Customer accessibility review",
    purpose:
      "Review the real customer and owner journeys at the exact release candidate before launch.",
    checks: [
      [
        "customer_journeys",
        "Complete sign-in, onboarding, billing, Brand Studio, support and custom-project journeys.",
      ],
      [
        "keyboard_navigation",
        "Use keyboard only; every interactive control is reachable and operable in a logical order.",
      ],
      [
        "focus_visibility",
        "Focus is always visible and returns to a sensible place after navigation or an error.",
      ],
      [
        "screen_reader_labels",
        "Headings, landmarks, fields, buttons, errors and status changes have useful accessible names.",
      ],
      [
        "zoom_and_reflow",
        "At 200% zoom and narrow mobile width, content reflows without hidden actions or horizontal reading.",
      ],
      [
        "reduced_motion",
        "Reduced-motion preference removes nonessential animation while preserving the complete journey.",
      ],
      [
        "form_errors",
        "Errors identify the affected field, explain recovery and do not erase valid customer input.",
      ],
      [
        "contrast_and_readability",
        "Text, controls, focus indicators and states remain readable across public and private surfaces.",
      ],
    ],
    evidence: [
      "Automated private and public browser journeys",
      "Mobile and desktop Lighthouse accessibility results",
      "Reduced-motion and responsive marketing tests",
      "Manual checks recorded in the notes supplied by the named reviewer",
    ],
  },
  SECURITY: {
    title: "Customer security review",
    purpose:
      "Review the threat models and hosted staging evidence for the exact release candidate before launch.",
    checks: [
      [
        "owner_access",
        "Owner-only routes and consequential actions require verified owner identity and recent MFA.",
      ],
      [
        "partner_isolation",
        "Active project membership is rechecked server-side; revoked and cross-project access fail closed.",
      ],
      [
        "database_rls",
        "Every protected table has RLS and direct database/API access obeys the same tenant boundary.",
      ],
      [
        "ask_retrieval",
        "Ask KXRA retrieves only authorized project context before any model request is constructed.",
      ],
      [
        "whatsapp_permissions",
        "WhatsApp identity pairing and project authority are resolved outside the model; outbound execution remains gated.",
      ],
      [
        "ai_run_logging",
        "AI requests, tools, evidence, costs, outcomes and failures create attributable run records.",
      ],
      [
        "approvals",
        "Signed approval envelopes are hash-bound, expire, reject replay and recheck current authority at execution.",
      ],
      [
        "cross_project_files_search",
        "Crafted IDs, files, downloads and search cannot cross an active project boundary.",
      ],
      [
        "public_private_separation",
        "Marketing is separate from the private OS; private routes and secrets do not enter public output.",
      ],
      [
        "threat_models",
        "Current identity, data, AI, billing, email, WhatsApp, public-site and automation threat models were reviewed.",
      ],
    ],
    evidence: [
      "GitHub CI and CodeQL for the exact commit",
      "Database and HTTP negative-access suites",
      "Hosted partner revoke/restore acceptance",
      "Stripe Sandbox and transactional-email staging evidence",
      "Security threat models and release-gate contract",
    ],
  },
} as const;

export type ReleaseReviewType = keyof typeof releaseReviewPackets;
