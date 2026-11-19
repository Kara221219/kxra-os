import BusinessAdmission from "../../components/BusinessAdmission";
import { account } from "../../lib/auth";
export const dynamic = "force-dynamic";
export default async function BusinessAdmissionPage() {
  try {
    await account();
    return (
      <main>
        <BusinessAdmission />
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Business details</h1>
        <p>Sign in to your customer workspace to continue.</p>
        <a href="/login">Sign in</a>
      </main>
    );
  }
}
