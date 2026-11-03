import type { PoolClient } from "pg";
import { connectorOperation, type ConnectorOperation } from "./contracts";
import { decodeConnectorOutcome } from "./results";
export {
  connectionSchema,
  connectionListSchema,
  readSchema,
  proposalSchema,
} from "./results";
export type {
  CustomerConnection,
  ConnectorRead,
  ConnectorProposal,
} from "./results";
export const adapterCommand = connectorOperation;
export type AdapterCommand = ConnectorOperation;

/** Atomic database adapters only. Network providers need a separate reviewed outbox
 * contract; do not put provider IO inside this transaction interface. The caller
 * must supply its verified authenticated/RLS transaction, never a model-owned client. */
export interface AtomicMockConnectorAdapter {
  readonly descriptor: Readonly<{
    id: "synthetic-notes";
    mode: "mock";
    credentials: "none";
    tools: readonly ["notes.read", "notes.append"];
    maxReadNotes: 50;
    writesRequireApproval: true;
  }>;
  invokeInScopedTransaction(
    db: Pick<PoolClient, "query">,
    command: AdapterCommand,
  ): Promise<unknown>;
}

export const mockNotesAdapter: AtomicMockConnectorAdapter = Object.freeze({
  descriptor: Object.freeze({
    id: "synthetic-notes",
    mode: "mock",
    credentials: "none",
    tools: Object.freeze(["notes.read", "notes.append"] as const),
    maxReadNotes: 50,
    writesRequireApproval: true,
  }),
  async invokeInScopedTransaction(
    db: Pick<PoolClient, "query">,
    input: AdapterCommand,
  ) {
    const command = connectorOperation.parse(input);
    const { action, ...parameters } = command;
    const result = (
      await db.query("select kxra.customer_connector($1,$2::jsonb) result", [
        action,
        JSON.stringify(parameters),
      ])
    ).rows[0]?.result;
    return decodeConnectorOutcome(command, result);
  },
});
