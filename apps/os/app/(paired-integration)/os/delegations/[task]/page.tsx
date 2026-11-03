import Link from "next/link";
import { integrationHuman } from "#kxra/paired-integration";
import { actor } from "../../../../../lib/auth";
import { PairedDelegations } from "#kxra/paired-delegations-ui";
export default async function Page({
  params,
}: {
  params: Promise<{ task: string }>;
}) {
  try {
    const { task } = await params;
    const data = await integrationHuman(await actor(), {
      operation: "LIST",
      task_id: task,
    });
    return (
      <main>
        <PairedDelegations
          task={task}
          initial={
            data.result as Parameters<typeof PairedDelegations>[0]["initial"]
          }
        />
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Local delegation unavailable</h1>
        <Link href="/os/workspace">Rooms</Link>
      </main>
    );
  }
}
