import {
  ImmersiveJourney,
  type JourneyChapter,
} from "../components/ImmersiveJourney";
import { PublicForm } from "../components/PublicForm";
import { journeyMedia } from "../lib/journey-media";
import "./cinema.css";
const journey: readonly JourneyChapter[] = [
  {
    index: "01",
    anchor: "overview",
    label: "Welcome",
    eyebrow: "KXRA / YOUR BUSINESS WORKSPACE",
    title: "Your team. Amplified.",
    copy: "Step inside KXRA. Bring your team, your chosen AI models and the work that matters into one accountable workspace.",
    tags: ["Collaborate", "Decide", "Deliver"],
    signal:
      "Scroll to move through the story. Use the tabs to choose where you go.",
  },
  {
    index: "02",
    anchor: "industries",
    label: "Property",
    eyebrow: "PROPERTY & HOSPITALITY",
    title: "Make the experience clearer.",
    copy: "Give each property team a shared room. Discuss enquiries, organise the evidence and ask an agent to draft the next step for review.",
    tags: ["Listing content", "Customer journeys", "Enquiry handoffs"],
    signal:
      "Illustrative application. These environments are not client premises or completed case studies.",
  },
  {
    index: "03",
    anchor: "retail",
    label: "Retail",
    eyebrow: "RETAIL & E-COMMERCE",
    title: "Bring the moving parts together.",
    copy: "Bring the campaign brief, the customer question and the operations team into the same conversation. Compare ideas without scattering the context.",
    tags: ["Brand consistency", "Campaign planning", "Practical workflows"],
    signal:
      "Proposed use cases, with scope and suitability assessed for each business.",
  },
  {
    index: "04",
    anchor: "services",
    label: "Services",
    eyebrow: "PROFESSIONAL SERVICES",
    title: "Give good work more room.",
    copy: "Keep client work scoped to the right people. Give an agent a clear role, challenge its draft and approve the work that follows.",
    tags: ["Process discovery", "Knowledge organisation", "Clearer ownership"],
    signal:
      "Recommendations depend on your evidence, constraints and agreed scope.",
  },
  {
    index: "05",
    anchor: "platform",
    label: "KXRA OS",
    eyebrow: "INSIDE THE PLATFORM",
    title: "Work, connected.",
    copy: "Team rooms. Your choice of model. Visible decisions and recorded agent runs. Explore the sample workflow.",
    tags: [],
    signal:
      "Sample workflow. Provider features require connection and verification.",
  },
  {
    index: "06",
    anchor: "approach",
    label: "Our approach",
    eyebrow: "FROM CONVERSATION TO ACCOUNTABLE WORK",
    title: "Connect. Collaborate. Decide.",
    copy: "Start with one team and one workflow. Choose the context your agent can use, review its response and turn the next step into an approved task.",
    tags: ["Scoped access", "Model choice", "Human approval"],
    signal:
      "Workspace rollout is being verified. Custom setup is scoped separately; model usage is billed by your provider.",
  },
];
export default function Home() {
  return (
    <>
      <ImmersiveJourney chapters={journey} media={journeyMedia} />
      <section id="contact" className="journey-contact">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h2>What would make your business work better?</h2>
          <p>
            Tell us which team and workflow you want to bring together. Request
            workspace access or a scoped implementation here.
          </p>
          <p>
            No payment or project commitment is created by this form. Share
            confidential material through your private workspace after
            onboarding.
          </p>
          <a href="mailto:info@kxra-group.com">info@kxra-group.com</a>
        </div>
        <PublicForm kind="CONTACT" />
      </section>
    </>
  );
}
