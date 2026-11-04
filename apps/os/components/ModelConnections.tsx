"use client";
import { useRouter } from "next/navigation";
import type { ModelConnection } from "../lib/team-workspace";
import type { CustomerAiPolicy } from "../../../packages/workspace/customer-ai-policy";
import { ActionForm } from "./TeamActionForm";
import { AiConnectionSetup } from "./AiConnectionSetup";
export function ModelConnections({
  connections,
  local,
  aiPolicy,
}: {
  connections: ModelConnection[];
  local: boolean;
  aiPolicy: CustomerAiPolicy;
}) {
  const router = useRouter();
  return (
    <details className="panel">
      <summary>Model connections ({connections.length})</summary>
      <p>
        Connections belong to you; only agents you explicitly attach may use
        them.
      </p>
      {!local && (
        <>
          <p>{aiPolicy.billing}</p>
          <p>{aiPolicy.dataFlow}</p>
          <p id="byok-key-handling">{aiPolicy.keyHandling}</p>
        </>
      )}
      {connections.map((c) => (
        <div className="team-message" key={c.id}>
          <strong>
            {c.name} · {c.model}
          </strong>
          <ActionForm
            path={"/connections/" + c.id}
            title={c.enabled ? "Disconnect model" : "Enable model"}
            build={() => ({ enabled: !c.enabled })}
          >
            <p>{c.enabled ? "Available to attached agents" : "Disabled"}</p>
          </ActionForm>
        </div>
      ))}
      {!local ? (
        <AiConnectionSetup
          aiPolicy={aiPolicy}
          onSaved={() => router.refresh()}
        />
      ) : (
        <ActionForm
          path="/connections"
          title="Connect model"
          build={(d) => ({
            name: d.get("name"),
            provider: d.get("provider"),
            model: d.get("model"),
            endpoint_id: d.get("endpoint_id") || "",
            key: d.get("key"),
            customer_billed_acknowledged:
              d.get("customer_billed_acknowledged") === "on",
          })}
        >
          <label>
            Connection name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Provider
            <select name="provider">
              {(local
                ? ["FIXTURE"]
                : ["OPENAI", "ANTHROPIC", "GOOGLE", "OPENROUTER", "COMPATIBLE"]
              ).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Model ID
            <input
              name="model"
              required
              defaultValue={local ? "fixture-draft" : ""}
              maxLength={160}
            />
          </label>
          {!local && (
            <label>
              Custom endpoint name (compatible providers only)
              <input name="endpoint_id" maxLength={80} />
            </label>
          )}
          <label>
            {local ? "Synthetic key" : "API key"}
            <input
              type="password"
              name="key"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={local ? undefined : "byok-key-handling"}
              defaultValue={local ? "local-fixture" : ""}
            />
          </label>
          {!local && (
            <label>
              <input
                type="checkbox"
                name="customer_billed_acknowledged"
                required
              />
              {aiPolicy.acknowledgement}
            </label>
          )}
          <p>
            {local
              ? "Use the generated demonstration model. Real keys are rejected here."
              : "OpenAI, Anthropic, Google and OpenRouter protocols are supported. Other compatible providers require an administrator-approved endpoint. Model availability and billing are controlled by your provider."}
          </p>
        </ActionForm>
      )}
    </details>
  );
}
