import WorkspaceEntry from "../components/WorkspaceEntry";
import { hostedSignupAvailable } from "../lib/hosted-self-service";
export const dynamic = "force-dynamic";

export default async function Home() {
  return <WorkspaceEntry registration={await hostedSignupAvailable()} />;
}
