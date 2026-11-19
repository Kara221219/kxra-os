import Link from "next/link";
import { notFound } from "next/navigation";
import { localMode } from "../../../packages/db";
import { connectionListSchema } from "../../../packages/connectors/adapter";
import { actor, HttpError } from "../lib/auth";
import { listCustomerConnectors } from "../lib/customer-connectors";
import { CustomerConnections } from "./CustomerConnections.local";
export default async function CustomerConnectionsPage() {
  if (!localMode() || process.env.VERCEL_ENV) return notFound();
  try {
    const identity = await actor();
    const data = (await listCustomerConnectors(identity)) as {
      result: unknown;
    };
    return (
      <CustomerConnections
        initialConnections={connectionListSchema.parse(data.result).connections}
      />
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      return (
        <main className="login">
          <h1>Sign in to view connections</h1>
          <p>Your connections belong to your account and workspace.</p>
          <Link href="/login">Sign in</Link>
        </main>
      );
    return (
      <main className="login">
        <h1>Connections unavailable</h1>
        <p>
          Your current workspace access could not be verified. No connector
          action was taken.
        </p>
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  }
}
