import { notFound } from "next/navigation";
import Link from "next/link";
import { localMode } from "../../../packages/db";
import { githubList } from "../../../packages/connectors/github-contracts";
import { actor } from "../lib/auth";
import { listGithubConnectors } from "../lib/github-connectors";
import { GithubConnections } from "./GithubConnections.local";
export default async function Page() {
  if (!localMode() || process.env.VERCEL_ENV) return notFound();
  try {
    return (
      <GithubConnections
        initial={githubList.parse(await listGithubConnectors(await actor()))}
      />
    );
  } catch {
    return (
      <main className="login">
        <h1>GitHub local preview unavailable</h1>
        <p>Sign in with an active local fixture account and workspace.</p>
        <Link href="/login">Sign in</Link>
      </main>
    );
  }
}
