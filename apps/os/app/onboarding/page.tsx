import Link from "next/link";
import { redirect } from "next/navigation";
import OnboardingStepForm from "../../components/OnboardingStepForm";
import { account, HttpError } from "../../lib/auth";
import { query } from "../../../../packages/db";

export const dynamic = "force-dynamic";

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  let a;
  try {
    a = await account();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    return <Unavailable />;
  }
  if (a.account_state === "ACTIVE") redirect("/os");
  if (["REGISTERED", "EMAIL_VERIFIED", "INVITED"].includes(a.account_state))
    redirect("/join/account");
  if (a.account_state !== "ONBOARDING") return <Unavailable />;

  const [progress, projects, profile, preferences, agreements] =
    await Promise.all([
      query<{ current_step: number; completed_steps: number[] }>(
        a,
        "select current_step,completed_steps from kxra.onboarding_progress where user_id=$1",
        [a.id],
      ),
      query<{
        project_id: string;
        project_code: string;
        project_name: string;
        project_role: "viewer" | "contributor";
        access_expires_at: string | null;
        summary: string;
        permissions: string[];
      }>(a, "select * from kxra.onboarding_project_access()"),
      query<{
        first_name: string | null;
        last_name: string | null;
        job_title: string | null;
        company: string | null;
        phone: string | null;
        mfa_state: string;
      }>(
        a,
        "select first_name,last_name,job_title,company,phone,mfa_state from kxra.profiles where user_id=$1",
        [a.id],
      ),
      query<{
        timezone: string;
        email_notifications: boolean;
        whatsapp_notifications: boolean;
        display_density: "comfortable" | "compact";
      }>(
        a,
        "select timezone,email_notifications,whatsapp_notifications,display_density from kxra.user_preferences where user_id=$1",
        [a.id],
      ),
      query<{
        id: string;
        document_key: string;
        version: number;
        title: string;
        body: string;
        status: "APPROVED" | "UNAPPROVED_PLACEHOLDER";
      }>(
        a,
        `select id,document_key,version,title,body,status
       from kxra.agreement_documents
       where required and status in ('APPROVED','UNAPPROVED_PLACEHOLDER')
       order by document_key,version`,
      ),
    ]);
  if (!progress[0] || !profile[0] || !preferences[0] || !projects.length)
    return <Unavailable />;
  const requested = Number(
    (await searchParams).step || progress[0].current_step,
  );
  const step =
    Number.isInteger(requested) &&
    requested >= 1 &&
    requested <= progress[0].current_step
      ? requested
      : progress[0].current_step;

  return (
    <main className="onboarding-page">
      <aside className="onboarding-side">
        <Link href="/" className="wordmark">
          KXRA<span>OS</span>
        </Link>
        <p>Partner onboarding</p>
        <ol aria-label="Onboarding progress">
          {[
            "Welcome",
            "Profile",
            "Security",
            "Project Access",
            "Working With KXRA",
            "WhatsApp",
            "Preferences",
            "Agreements",
            "Complete",
          ].map((title, index) => {
            const number = index + 1;
            const available = number <= progress[0].current_step;
            return (
              <li
                key={title}
                aria-current={number === step ? "step" : undefined}
              >
                {available ? (
                  <Link href={`/onboarding?step=${number}`}>
                    {number}. {title}
                  </Link>
                ) : (
                  <span>
                    {number}. {title}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <form action="/api/auth" method="post">
          <button className="text-button" name="logout" value="1">
            Save and sign out
          </button>
        </form>
      </aside>
      <section className="onboarding-content">
        <div
          className="progress-track"
          aria-label={`${progress[0].completed_steps.length} of 9 steps completed`}
        >
          <span
            style={{
              width: `${(progress[0].completed_steps.length / 9) * 100}%`,
            }}
          />
        </div>
        <OnboardingStepForm
          step={step}
          currentStep={progress[0].current_step}
          completedSteps={progress[0].completed_steps}
          projects={projects}
          agreements={agreements}
          profile={profile[0]}
          preferences={preferences[0]}
          recipientHint={
            a.email
              ? a.email.replace(/^(.).*(@.*)$/, "$1***$2")
              : "verified invited email"
          }
        />
      </section>
    </main>
  );
}

function Unavailable() {
  return (
    <main className="join-page">
      <div className="join-card">
        <h1>Onboarding unavailable.</h1>
        <p>Your account is not eligible to continue this onboarding flow.</p>
        <Link href="/login">Return to sign in</Link>
      </div>
    </main>
  );
}
