import { actor } from "../../../lib/auth";
import { loadDecisionReviews } from "../../../lib/platform-admin";

export const metadata = { title: "Decision Review queue · KXRA" };

export default async function AdminReviews() {
  const { website, projects } = await loadDecisionReviews(await actor());
  return (
    <>
      <h1>Decision Review</h1>
      <p>
        Website requests for the £250 Decision Review, then the private delivery
        queue once a request becomes a project.
      </p>
      <h2>Website requests</h2>
      <ul>
        {(
          website as {
            id: string;
            name: string;
            company: string;
            status: string;
            message: string;
          }[]
        ).map((row) => (
          <li key={row.id}>
            {row.name}
            {row.company ? ` · ${row.company}` : ""} · {row.status}
            <br />
            {row.message}
          </li>
        ))}
      </ul>
      {website.length === 0 && <p>No Decision Review website requests yet.</p>}
      <h2>Delivery queue</h2>
      <ul>
        {(projects as { id: string; state: string; problem: string }[]).map(
          (row) => (
            <li key={row.id}>
              {row.state}: {row.problem}
            </li>
          ),
        )}
      </ul>
    </>
  );
}
