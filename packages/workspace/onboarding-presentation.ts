import {
  customerWorkspace,
  workspacePresentation,
} from "./workspace-presentation";

/** Copy for the server-resolved selected membership. No access decisions. */
export function onboardingPresentation(
  context: Parameters<typeof workspacePresentation>[0],
) {
  const customer = customerWorkspace(context);
  return {
    label: `${workspacePresentation(context).label.replace(/workspace$/, "onboarding")}`,
    titles: [
      "Welcome to KXRA",
      "Personal Profile",
      "Security",
      "Project Access",
      customer ? "Your Workspace" : "Working With KXRA",
      "WhatsApp (optional)",
      "Preferences",
      "Access Review",
      "Complete",
    ],
    welcome: customer
      ? "Your workspace brings your team, shared work and AI tools together. Review the projects available to you in this organisation before getting started."
      : "KXRA is an AI-native venture group that turns evidence into controlled experiments and decisions. Your access is limited to the projects below.",
    destinations: customer
      ? "Your workspace includes these scoped destinations:"
      : "Your partner workspace includes these scoped destinations:",
    features: customer
      ? [
          "Workspace: rooms, conversations and tasks within your permitted projects",
          "Model connections: bring your own supported provider account when available",
          "Files and knowledge: the sources you have permission to use",
          "Getting started: check recorded workspace access",
          "Support and privacy: submit a request for your organisation",
        ]
      : [
          "My Projects — assigned ventures only",
          "Ask KXRA — evidence retrieval within one selected project",
          "Ideas — your submissions and explicit shares",
          "Tasks and Files — authorized project work",
          "Activity — your permitted operating history",
          "WhatsApp — optional paired access when enabled",
        ],
    completion: customer
      ? "Complete onboarding and open my team workspace."
      : "Complete onboarding and open my KXRA dashboard.",
  };
}
export type OnboardingPresentation = ReturnType<typeof onboardingPresentation>;
