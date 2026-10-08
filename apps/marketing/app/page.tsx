import {
  ImmersiveJourney,
  type JourneyChapter,
} from "../components/ImmersiveJourney";
import "./cinema.css";

const journey: readonly JourneyChapter[] = [
  {
    index: "01",
    eyebrow: "Ideas deserve a way forward",
    title: "Build what comes next.",
    copy: "Bring your business a clearer direction. KXRA connects ideas, practical tools and custom projects—starting with the problem worth solving.",
    tags: ["Business tools", "Custom projects", "Human control"],
    signal:
      "Explore the platform. Discuss a project. Start with one useful outcome.",
  },
  {
    index: "02",
    eyebrow: "Property · hospitality · professional services",
    title: "Different industries. Shared possibilities.",
    copy: "A clearer listing. A stronger customer journey. Less repetitive work. Explore where better content and connected systems could help your business.",
    tags: ["Customer experience", "Clearer marketing", "Better workflows"],
    signal: "Illustrative use cases—not client results or promises of revenue.",
  },
  {
    index: "03",
    eyebrow: "Your knowledge. Your next advantage.",
    title: "Build reusable capability around real work.",
    copy: "Organise brand knowledge, project decisions and useful evidence in KXRA OS. Bring specialist needs to a separately scoped custom project.",
    tags: ["Brand Studio", "Project workspaces", "Controlled AI"],
    signal:
      "Provider-powered features become available after connection and verification.",
  },
  {
    index: "04",
    eyebrow: "Start small. Measure. Improve.",
    title: "One problem. A meaningful next move.",
    copy: "Tell us what takes too long, what your customers need, or what you want to build. We’ll start with scope, feasibility and the outcome you can measure.",
    tags: ["Clear scope", "Separate project pricing", "Explicit approvals"],
    signal: "Custom work is reviewed before a quote. No automatic commitment.",
  },
];

export default function Home() {
  return <ImmersiveJourney chapters={journey} />;
}
