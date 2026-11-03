import { z } from "zod";
/** Only this checked-in stub protocol is accepted. This is not an installed
 * Codex version, a live capability attestation or a provider authorization. */
export const codexStubIdentity = "kxra-codex-policy-stub/1";
export const codexTextConfiguration = {
  approval_policy: "on-request",
  sandbox_mode: "read-only",
  web_search: "disabled",
  allow_login_shell: false,
  project_doc_max_bytes: 0,
  cli_auth_credentials_store: "ephemeral",
  history: { persistence: "none" },
  features: {
    shell_tool: false,
    shell_snapshot: false,
    apps: false,
    hooks: false,
    multi_agent: false,
    view_image: false,
    remote_plugin: false,
    skill_mcp_dependency_install: false,
    goals: false,
    memories: false,
  },
  apps: { _default: { enabled: false } },
  plugins: { _default: { enabled: false } },
  mcp_servers: {},
} as const;
const freeze = (v: object) => {
  for (const child of Object.values(v))
    if (child && typeof child === "object") freeze(child);
  Object.freeze(v);
};
freeze(codexTextConfiguration);

const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => JSON.stringify(k) + ":" + canonical(value))
        .join(",") +
      "}"
    );
  return JSON.stringify(v) ?? "undefined";
};
export function assertCodexTextConfiguration(value: unknown) {
  if (canonical(value) !== canonical(codexTextConfiguration))
    throw Error("CODEX_CONFIGURATION_UNACCEPTED");
}
export function assertCodexConfigRead(value: unknown) {
  const ack = z
    .object({
      config: z.unknown(),
      origins: z.record(z.string(), z.unknown()).optional(),
      layers: z.null().optional(),
    })
    .strict()
    .parse(value);
  assertCodexTextConfiguration(ack.config);
  // No machine/system/project layer has been accepted in this stub contract.
  if (Object.keys(ack.origins ?? {}).length)
    throw Error("CODEX_CONFIG_LAYER_UNACCEPTED");
}
export function codexTextOverrides(): string[] {
  const result: string[] = [];
  const flatten = (v: unknown, key: string) => {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).length
    ) {
      for (const [k, value] of Object.entries(v))
        flatten(value, key ? key + "." + k : k);
    } else result.push(key + "=" + JSON.stringify(v));
  };
  flatten(codexTextConfiguration, "");
  return result;
}
