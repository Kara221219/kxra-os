import {
  hostedPairedSetupConfiguration,
  hostedPairedSetupRoute,
  hostedPairedSetupPageData,
  type HostedPairedSetupPorts,
} from "../../../packages/workspace/paired-setup-hosted";
const ports: HostedPairedSetupPorts = {
  identity: async () => (await import("./auth")).actor(),
  query: async (actor, sql, values) =>
    (await import("../../../packages/db")).query<{ value: unknown }>(
      actor,
      sql,
      values,
    ),
};
export async function pairedSetupRoute(request: Request) {
  return hostedPairedSetupRoute(request, ports);
}
export async function pairedSetupPageData() {
  return hostedPairedSetupPageData(ports);
}
export { hostedPairedSetupConfiguration };
