type AgentManifest = {
  code: string;
  role: string;
  manager_code: string | null;
  current_version: number;
  description: string;
  objective: string;
  tool_capabilities: string[];
  permissions: string;
  memory_scope: string;
  project_scope: string;
  approval_boundary: string;
  qa_process: string;
  success_criteria: string;
  model_policy_code: string;
  status: string;
};

type SkillManifest = {
  code: string;
  name: string;
  owner_agent_code: string;
  current_version: number;
  when_to_use: string;
  side_effect_class: string;
  failure_handling: string;
  approval_boundary: string;
  status: string;
  tools: string[];
};

type AgentRun = {
  id: string;
  project_code: string | null;
  agent_code: string;
  agent_version: number;
  skill_code: string;
  skill_version: number;
  initiated_by_name: string | null;
  provider: string;
  model: string;
  origin: string;
  state: string;
  delivery_state: string;
  attempt_count: number;
  tool_call_count: number;
  evidence_count: number;
  input_tokens: string;
  output_tokens: string;
  cost_minor: string;
  failure_code: string | null;
  created_at: string;
  completed_at: string | null;
};

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB") : "In progress";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function AgentRegistryView({ agents }: { agents: AgentManifest[] }) {
  if (!agents.length) return <Empty>No typed agent manifests exist.</Empty>;
  return (
    <div className="record-list">
      {agents.map((agent) => (
        <article className="record" key={agent.code}>
          <div className="record-top">
            <div>
              <p className="eyebrow">{agent.code}</p>
              <h3>{agent.role}</h3>
            </div>
            <span className="badge">{readable(agent.status)}</span>
          </div>
          <p>{agent.description}</p>
          <p>
            <strong>Objective:</strong> {agent.objective}
          </p>
          <footer>
            <span>v{agent.current_version}</span>
            <span>Manager: {agent.manager_code || "Owner"}</span>
            <span>Policy: {agent.model_policy_code}</span>
          </footer>
          <details>
            <summary>Execution boundary</summary>
            <dl className="detail-list">
              <div>
                <dt>Tools</dt>
                <dd>{agent.tool_capabilities.join(", ") || "None"}</dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>{agent.permissions}</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>{agent.memory_scope}</dd>
              </div>
              <div>
                <dt>Projects</dt>
                <dd>{agent.project_scope}</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>{agent.approval_boundary}</dd>
              </div>
              <div>
                <dt>QA</dt>
                <dd>{agent.qa_process}</dd>
              </div>
              <div>
                <dt>Success</dt>
                <dd>{agent.success_criteria}</dd>
              </div>
            </dl>
          </details>
        </article>
      ))}
    </div>
  );
}

export function SkillLibraryView({ skills }: { skills: SkillManifest[] }) {
  if (!skills.length) return <Empty>No typed skill manifests exist.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th>Owner / state</th>
            <th>Use</th>
            <th>Capabilities</th>
            <th>Boundary</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr key={skill.code}>
              <td className="project-name">
                <small>{skill.code}</small>
                <strong>{skill.name}</strong>
                <small>Version {skill.current_version}</small>
              </td>
              <td data-label="Owner / state">
                <p>{skill.owner_agent_code}</p>
                <span className="badge">{readable(skill.status)}</span>
              </td>
              <td data-label="Use">{skill.when_to_use}</td>
              <td data-label="Capabilities">
                <p>{skill.tools.join(", ") || "No executable tools"}</p>
                <small>{readable(skill.side_effect_class)}</small>
              </td>
              <td data-label="Boundary">
                <p>{skill.approval_boundary}</p>
                <small>{skill.failure_handling}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentRunHistoryView({ runs }: { runs: AgentRun[] }) {
  if (!runs.length)
    return <Empty>No typed agent execution has been recorded.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Capability</th>
            <th>State</th>
            <th>Evidence</th>
            <th>Usage</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="project-name">
                <small>{run.project_code || "KXRA GROUP"}</small>
                <strong>{run.id}</strong>
                <small>
                  {run.initiated_by_name || "Attributed account"} · {run.origin}
                </small>
              </td>
              <td data-label="Capability">
                <p>
                  {run.agent_code} v{run.agent_version}
                </p>
                <small>
                  {run.skill_code} v{run.skill_version}
                </small>
                <small>
                  {run.provider} · {run.model}
                </small>
              </td>
              <td data-label="State">
                <span className="badge">{readable(run.state)}</span>
                <p>{readable(run.delivery_state)}</p>
                {run.failure_code && <small>{run.failure_code}</small>}
              </td>
              <td data-label="Evidence">
                <p>{run.evidence_count} envelope item(s)</p>
                <small>
                  {run.attempt_count} attempt(s) · {run.tool_call_count} tool
                  call(s)
                </small>
              </td>
              <td data-label="Usage">
                <p>
                  {run.input_tokens} in / {run.output_tokens} out
                </p>
                <small>GBP minor units: {run.cost_minor}</small>
              </td>
              <td data-label="Time">
                <p>{date(run.created_at)}</p>
                <small>{date(run.completed_at)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
