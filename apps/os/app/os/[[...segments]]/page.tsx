import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import Shell from "../../../components/Shell";
import AccountControls from "../../../components/AccountControls";
import {
  InvitationList,
  PartnerCards,
} from "../../../components/PartnerAdministration";
import {
  RecordForm,
  ActionButton,
  UploadForm,
  AskForm,
  EditRecordForm,
  WorkflowTaskCards,
  InvitationForm,
} from "../../../components/Forms";
import {
  AdminView,
  DashboardSectionView,
  IdeaInboxView,
  PublicEnquiryInbox,
  PortfolioView,
  WorkLogView,
} from "../../../components/ControlPlaneViews";
import ProjectWorkspaceView from "../../../components/ProjectWorkspaceView";
import { CustomProjectRequestForm } from "../../../components/CommercialForms";
import BrandStudio from "../../../components/BrandStudio";
import RoutineRegistry, {
  type RoutineRow,
} from "../../../components/RoutineRegistry";
import {
  AgentRegistryView,
  AgentRunHistoryView,
  SkillLibraryView,
} from "../../../components/AIExecutionViews";
import { actor, HttpError, owner, type Actor } from "../../../lib/auth";
import {
  totals,
  listProjects,
  listRecords,
  project,
  getRecord,
  operatingLoop,
  type Project,
  type RecordRow,
} from "../../../lib/data";
import {
  adminSnapshot,
  ideaStates,
  listIdeas,
  listPublicEnquiries,
  listPortfolio,
  listWorkLog,
  ownerDashboard,
} from "../../../lib/control-plane";
import { loadProjectWorkspace } from "../../../lib/project-workspaces";
import { loadBrandStudio } from "../../../lib/brand-studio";
import { localMode, query } from "../../../../../packages/db";
export const dynamic = "force-dynamic";
const modules: Record<string, [string, string]> = {
  assumptions: ["Assumptions", "assumption"],
  experiments: ["Experiments", "experiment"],
  decisions: ["Decisions", "decision"],
  risks: ["Risks", "risk"],
  sources: ["Research Sources", "source"],
  tasks: ["Tasks", "task"],
  finance: ["Finance", "finance"],
  knowledge: ["Knowledge", "knowledge"],
  agents: ["AI Agent Registry", "agent"],
  skills: ["Skills Library", "skill"],
  routines: ["Routine Registry", "routine"],
  runs: ["Agent Run History", "run"],
  blockers: ["Blockers", "blocker"],
};
function Heading({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">KXRA operating system</p>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
function Projects({ projects }: { projects: Project[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Venture</th>
            <th>Stage</th>
            <th>Confidence</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td className="project-name">
                <small>{p.code}</small>
                <Link href={"/os/projects/" + p.id}>
                  <strong>{p.name}</strong>
                </Link>
              </td>
              <td data-label="Stage">
                <span className="badge">{p.stage}</span>
              </td>
              <td data-label="Confidence">
                {p.confidence_score ?? "Not assessed"}
              </td>
              <td data-label="Next action">{p.next_action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length === 0 && (
        <div className="empty">
          No projects are currently assigned to your account.
        </div>
      )}
    </div>
  );
}
function Records({
  rows,
  projects,
}: {
  rows: RecordRow[];
  projects: Project[];
}) {
  return (
    <div className="record-list">
      {rows.map((r) => (
        <article className="record" key={r.id}>
          <div className="record-top">
            <h3>
              <Link href={"/os/record/" + r.id}>{r.title}</Link>
            </h3>
            <span className="badge">{r.classification}</span>
          </div>
          <p>{r.body.slice(0, 600)}</p>
          <footer>
            <span>
              {projects.find((p) => p.id === r.project_id)?.code || "Group"}
            </span>
            <span>{r.status}</span>
            <span>
              {r.visibility === "owner_only" ? "Owner only" : "Project shared"}
            </span>
            <span>Version {r.version}</span>
          </footer>
        </article>
      ))}
      {!rows.length && (
        <div className="empty">No records yet. New work will appear here.</div>
      )}
    </div>
  );
}
export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{
    project?: string;
    version?: string;
    state?: string;
    stage?: string;
    disposition?: string;
    sort?: string;
    direction?: string;
    page?: string;
    actor?: string;
    department?: string;
    type?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}) {
  let a: Actor;
  try {
    a = await actor();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.code === "TENANT_SELECTION_REQUIRED")
      redirect("/select-organisation");
    if (e instanceof HttpError && e.code === "AGREEMENT_REQUIRED")
      redirect("/agreements");
    if (e instanceof HttpError && e.code === "ONBOARDING_REQUIRED")
      redirect("/onboarding");
    return (
      <main className="login">
        <h1>Access unavailable</h1>
        <p>Your account does not have an active membership.</p>
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  }
  const { segments = [] } = await params;
  const section = segments[0] || "";
  const queryParameters = await searchParams;
  const filter = queryParameters.project;
  let content: React.ReactNode;
  const projects = await listProjects(a);
  const writable = await query<{ id: string }>(
    a,
    "select id from kxra.projects where kxra_private.can_project(id,true)",
  );
  const writableProjects = projects.filter((p) =>
    writable.some((w) => w.id === p.id),
  );
  try {
    if (!section && a.role === "owner") {
      const dashboard = await ownerDashboard(a);
      content = (
        <>
          <Heading
            title="Your operating overview"
            sub="Persisted work that needs attention, a decision, or review."
          />
          <div className="dashboard-control-grid">
            <DashboardSectionView title="Today" section={dashboard.today} />
            <DashboardSectionView
              title="Needs your decision"
              section={dashboard.needs_your_decision}
              tone="decision"
            />
            <DashboardSectionView
              title="At risk"
              section={dashboard.at_risk}
              tone="risk"
            />
            <DashboardSectionView
              title="Recent activity"
              section={dashboard.recent_activity}
            />
          </div>
        </>
      );
    } else if (section === "portfolio") {
      owner(a);
      const stage = queryParameters.stage || undefined;
      const disposition = queryParameters.disposition || undefined;
      const sort = queryParameters.sort || "code";
      const direction = queryParameters.direction === "desc" ? "desc" : "asc";
      const page = Math.max(1, Number(queryParameters.page || 1) || 1);
      const result = await listPortfolio(a, {
        lifecycleStage: stage,
        disposition,
        sort,
        direction,
        page,
        pageSize: 10,
      });
      const memberRows = await query<{
        project_id: string;
        id: string;
        display_name: string;
        role: string;
      }>(
        a,
        `select p.id as project_id,m.id,m.display_name,
          case when m.role='owner' then 'KXRA owner' else pm.role end as role
         from kxra.projects p join kxra.members m on m.org_id=p.org_id and m.active
         left join kxra.project_memberships pm on pm.project_id=p.id and pm.user_id=m.id
          and pm.active and (pm.expires_at is null or pm.expires_at>now())
         where m.role='owner' or pm.user_id is not null
         order by p.code,m.role,m.display_name,m.id`,
      );
      const membersByProject = memberRows.reduce<
        Record<string, { id: string; display_name: string; role: string }[]>
      >((grouped, row) => {
        (grouped[row.project_id] ||= []).push(row);
        return grouped;
      }, {});
      content = (
        <>
          <Heading
            title="Portfolio"
            sub="Governed venture state, evidence coverage, capital actuals and next gates."
          />
          <PortfolioView
            result={result}
            filters={{ stage, disposition, sort, direction }}
            projects={projects}
            membersByProject={membersByProject}
          />
        </>
      );
    } else if (!section || (section === "projects" && !segments[1])) {
      const rows = await listRecords(a);
      content = (
        <>
          <Heading
            title={
              section === "projects" ? "Projects" : "Your project workspace"
            }
            sub={
              a.role === "owner"
                ? "Evidence, decisions and the next useful step."
                : "Updates and evidence from your assigned projects."
            }
          />
          <div className="stats">
            <div className="stat">
              <p>Projects in view</p>
              <strong>{projects.length.toString().padStart(2, "0")}</strong>
            </div>
            <div className="stat">
              <p>Evidence records</p>
              <strong>{rows.length}</strong>
            </div>
            <div className="stat">
              <p>Open risks</p>
              <strong>
                {
                  rows.filter(
                    (row) => row.kind === "risk" && row.status !== "archived",
                  ).length
                }
              </strong>
            </div>
            <div className="stat">
              <p>Investment recorded</p>
              <strong>Unknown</strong>
            </div>
          </div>
          <div className="panel">
            <h2>Venture portfolio</h2>
            <Projects projects={projects} />
          </div>
          <div className="grid">
            <section className="panel">
              <h2>Next gates</h2>
              {projects.slice(0, 3).map((p) => (
                <div className="list-item" key={p.id}>
                  <strong>{p.code}</strong>
                  <p>{p.next_action}</p>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Operating discipline</h2>
              {a.role === "owner" && (
                <>
                  <div className="list-item">
                    <span className="badge amber">Research only</span>
                    <p>Trading execution remains disabled.</p>
                  </div>
                  <div className="list-item">
                    <span className="badge">Demand first</span>
                    <p>Digital product creation requires evidence.</p>
                  </div>
                </>
              )}
              <p>
                Every claim needs evidence. New records remain drafts until
                reviewed.
              </p>
              <Link href="/os/ask">Search your evidence ↗</Link>
            </section>
          </div>
          {a.role !== "owner" && (
            <section className="panel" style={{ marginTop: 24 }}>
              <h2>Business tools</h2>
              <p>
                Your organization only sees tools covered by a current
                subscription entitlement or an auditable free owner grant.
                Custom implementation remains separately scoped and priced.
              </p>
              <div className="record-actions">
                <Link href="/os/tools">View available tools ↗</Link>
                <Link href="/os/custom-projects">
                  Request a custom project ↗
                </Link>
              </div>
            </section>
          )}
        </>
      );
    } else if (section === "projects" && segments[1]) {
      if (segments.length > 3) notFound();
      const workspace = await loadProjectWorkspace(
        a,
        segments[1],
        segments[2] || "overview",
      );
      content = (
        <>
          <Heading
            title={workspace.project.name}
            sub={`${workspace.project.code} · ${workspace.project.status}`}
          >
            <Link href="/os/projects">All projects</Link>
          </Heading>
          <ProjectWorkspaceView
            workspace={workspace}
            owner={a.role === "owner"}
            actorId={a.id}
          />
        </>
      );
    } else if (section === "ideas") {
      const state = ideaStates.find((value) => value === queryParameters.state);
      const page = Math.max(1, Number(queryParameters.page || 1) || 1);
      if (filter) await project(a, filter);
      const result = await listIdeas(a, {
        project: filter,
        state,
        page,
        pageSize: 25,
      });
      const publicEnquiries =
        a.role === "owner" ? await listPublicEnquiries(a) : [];
      const partnerRows =
        a.role === "owner"
          ? await query<{
              project_id: string;
              id: string;
              display_name: string;
              role: string;
            }>(
              a,
              `select pm.project_id,m.id,m.display_name,pm.role
               from kxra.project_memberships pm
               join kxra.members m on m.id=pm.user_id and m.org_id=pm.org_id
               where pm.active and m.active and (pm.expires_at is null or pm.expires_at>now())
               order by pm.project_id,m.display_name,m.id`,
            )
          : [];
      const partnersByProject = partnerRows.reduce<
        Record<string, { id: string; display_name: string; role: string }[]>
      >((grouped, row) => {
        (grouped[row.project_id] ||= []).push(row);
        return grouped;
      }, {});
      content = (
        <>
          <Heading
            title="Idea Inbox"
            sub={
              a.role === "owner"
                ? "All submitted ideas, with explicit state, evidence and sharing controls."
                : "Your submissions and ideas explicitly shared with you."
            }
          />
          {a.role === "owner" && <PublicEnquiryInbox rows={publicEnquiries} />}
          <IdeaInboxView
            result={result}
            filters={{ project: filter, state }}
            projects={projects}
            writableProjects={writableProjects}
            owner={a.role === "owner"}
            partnersByProject={partnersByProject}
          />
        </>
      );
    } else if (section === "tasks") {
      const loops = await Promise.all(
        projects.map((item) => operatingLoop(a, item.id)),
      );
      const taskRows = loops.flatMap((loop) => loop.tasks);
      const taskRecords = loops.flatMap((loop) => loop.records);
      content = (
        <>
          <Heading
            title="Tasks"
            sub={
              a.role === "owner"
                ? "Assigned work tied to exact project record versions."
                : "Work assigned to you within your current project access."
            }
          />
          {taskRows.length ? (
            <WorkflowTaskCards
              tasks={taskRows}
              records={taskRecords}
              actorId={a.id}
              owner={a.role === "owner"}
            />
          ) : (
            <div className="empty">
              No workflow tasks are currently assigned.
            </div>
          )}
        </>
      );
    } else if (section === "tools") {
      const [tools, studio] = await Promise.all([
        query<{
          tool_key: string;
          name: string;
          description: string;
          activation_event: string;
        }>(
          a,
          `select tool.tool_key,tool.name,tool.description,version.activation_event
           from kxra.tool_catalogue tool
           join kxra.tool_versions version on version.tool_id=tool.id
            and version.state='ACTIVE'
           where tool.state='ACTIVE' order by tool.name`,
        ),
        loadBrandStudio(a),
      ]);
      content = (
        <>
          <Heading
            title="Business tools"
            sub="Entitlement-controlled tools for repeatable business work."
          />
          <div className="record-list">
            {tools.map((tool) => {
              const available =
                tool.tool_key === "brand-studio" &&
                studio.entitlements.access.allowed;
              return (
                <article className="record" key={tool.tool_key}>
                  <div className="record-top">
                    <h2>{tool.name}</h2>
                    <span className={`badge${available ? "" : " amber"}`}>
                      {available ? "Included" : "Not included"}
                    </span>
                  </div>
                  <p>{tool.description}</p>
                  <p className="subtle">
                    Activation event: {tool.activation_event}
                  </p>
                  {available ? (
                    <Link href="/os/brand-studio">Open Brand Studio ↗</Link>
                  ) : (
                    <p>
                      Ask KXRA about a subscription or owner-issued free partner
                      grant. No paid subscription is inferred from account
                      access.
                    </p>
                  )}
                </article>
              );
            })}
            {!tools.length && <div className="empty">No tools are active.</div>}
          </div>
          <section className="panel" style={{ marginTop: 24 }}>
            <h2>Need something specific?</h2>
            <p>
              A platform subscription does not include bespoke implementation.
              Submit a private custom-project request for separate triage,
              proposal and commercial approval.
            </p>
            <Link href="/os/custom-projects">Request a custom project ↗</Link>
          </section>
        </>
      );
    } else if (section === "brand-studio") {
      const snapshot = await loadBrandStudio(a);
      content = (
        <>
          <Heading
            title="KXRA Brand Studio"
            sub="Source-linked brand profiles, campaign briefs and controlled creative export."
          >
            <Link href="/os/tools">All tools</Link>
          </Heading>
          <BrandStudio
            snapshot={snapshot}
            projects={writableProjects.map(({ id, code, name }) => ({
              id,
              code,
              name,
            }))}
          />
        </>
      );
    } else if (section === "custom-projects") {
      const requests = await query<{
        id: string;
        problem: string;
        desired_outcome: string;
        state: string;
        reuse_consent: boolean;
        created_at: string;
        proposals: {
          id: string;
          version: number;
          state: string;
          price_minor: number;
          currency: string;
          valid_until: string;
        }[];
      }>(
        a,
        `select request.id,request.problem,request.desired_outcome,request.state,
          request.reuse_consent,request.created_at,
          coalesce(jsonb_agg(jsonb_build_object(
            'id',proposal.id,'version',proposal.version,'state',proposal.state,
            'price_minor',proposal.price_minor,'currency',proposal.currency,
            'valid_until',proposal.valid_until
          ) order by proposal.version) filter(where proposal.id is not null),'[]'::jsonb) as proposals
         from kxra.custom_project_requests request
         left join kxra.project_proposals proposal on proposal.request_id=request.id
         group by request.id order by request.created_at desc`,
      );
      content = (
        <>
          <Heading
            title="Custom projects"
            sub="Private requests and separately scoped KXRA proposals."
          />
          <CustomProjectRequestForm />
          <div className="record-list">
            {requests.map((request) => (
              <article className="record" key={request.id}>
                <div className="record-top">
                  <h3>{request.problem}</h3>
                  <span className="badge">{request.state}</span>
                </div>
                <p>{request.desired_outcome}</p>
                <footer>
                  <span>{request.proposals.length} proposal version(s)</span>
                  <span>
                    {request.reuse_consent
                      ? "Generalized-learning consent recorded"
                      : "No reuse consent"}
                  </span>
                  <span>
                    {new Date(request.created_at).toLocaleDateString("en-GB")}
                  </span>
                </footer>
              </article>
            ))}
            {!requests.length && (
              <div className="empty">No custom project requests yet.</div>
            )}
          </div>
        </>
      );
    } else if (section === "agents") {
      owner(a);
      const agents = await query<
        Parameters<typeof AgentRegistryView>[0]["agents"][number]
      >(
        a,
        `select manifest.code,manifest.role,manifest.manager_code,manifest.current_version,
          version.description,version.objective,version.tool_capabilities,version.permissions,
          version.memory_scope,version.project_scope,version.approval_boundary,
          version.qa_process,version.success_criteria,version.model_policy_code,version.status
         from kxra.agent_manifests manifest
         join kxra.agent_manifest_versions version
          on version.agent_id=manifest.id and version.version=manifest.current_version
         order by case when manifest.code='AGT-ASK' then 0 else 1 end,manifest.code`,
      );
      content = (
        <>
          <Heading
            title="AI Agent Registry"
            sub="Versioned capability contracts. Draft definitions cannot execute."
          />
          <p className="notice">
            KXRA uses a managed hierarchy. Only approved manifests with a bound
            skill, model policy, budget and current user authority may run.
          </p>
          <AgentRegistryView agents={agents} />
        </>
      );
    } else if (section === "skills") {
      owner(a);
      const skills = await query<
        Parameters<typeof SkillLibraryView>[0]["skills"][number]
      >(
        a,
        `select manifest.code,manifest.name,owner.code as owner_agent_code,
          manifest.current_version,version.when_to_use,version.side_effect_class,
          version.failure_handling,version.approval_boundary,version.status,
          coalesce((select array_agg(binding.tool_code order by binding.tool_code)
           from kxra.skill_tool_bindings binding where binding.skill_id=manifest.id
            and binding.skill_version=manifest.current_version),'{}'::text[]) as tools
         from kxra.skill_manifests manifest
         join kxra.agent_manifests owner on owner.id=manifest.owner_agent_id
         join kxra.skill_manifest_versions version
          on version.skill_id=manifest.id and version.version=manifest.current_version
         order by case when manifest.code='SKL-ASK-001' then 0 else 1 end,manifest.code`,
      );
      content = (
        <>
          <Heading
            title="Skills Library"
            sub="Typed, versioned operating procedures and their exact tool boundaries."
          />
          <SkillLibraryView skills={skills} />
        </>
      );
    } else if (section === "routines") {
      owner(a);
      const routines = await query<RoutineRow>(
        a,
        `select manifest.id,manifest.code,manifest.name,manifest.enabled,
          version.id as version_id,version.version,version.status,version.version_sha256,
          version.trigger_type,version.trigger_config,version.timezone,version.calendar_code,
          version.action_graph,version.scope_mode,version.maximum_attempts,version.lease_seconds,
          version.notification_policy,coalesce(scopes.projects,'[]'::jsonb) as project_scopes,
          coalesce(runs.run_count,0)::integer as run_count,last_run.state as last_run_state,
          last_run.created_at as last_run_at
         from kxra.routine_manifests manifest
         join kxra.routine_manifest_versions version
          on version.routine_id=manifest.id and version.version=manifest.current_version
         left join lateral(
          select jsonb_agg(jsonb_build_object('id',project.id,'code',project.code,'name',project.name)
           order by project.code) as projects
          from kxra.routine_version_projects scope
          join kxra.projects project on project.id=scope.project_id
          where scope.routine_version_id=version.id
         ) scopes on true
         left join lateral(
          select count(*)::integer as run_count from kxra.routine_runs run
          where run.routine_id=manifest.id
         ) runs on true
         left join lateral(
          select run.state,run.created_at from kxra.routine_runs run
          where run.routine_id=manifest.id order by run.created_at desc,run.id desc limit 1
         ) last_run on true
         order by manifest.code`,
      );
      content = (
        <>
          <Heading
            title="Routine Registry"
            sub="Versioned triggers, scopes, leases, checkpoints and disabled notification intents."
          />
          <RoutineRegistry routines={routines} />
        </>
      );
    } else if (section === "runs") {
      owner(a);
      const runs = await query<
        Parameters<typeof AgentRunHistoryView>[0]["runs"][number]
      >(
        a,
        `select run.id,project.code as project_code,agent.code as agent_code,
          run.agent_version,skill.code as skill_code,run.skill_version,
          member.display_name as initiated_by_name,run.provider,run.model,run.origin,
          run.state,run.delivery_state,coalesce(attempts.count,0)::integer as attempt_count,
          coalesce(tools.count,0)::integer as tool_call_count,
          coalesce(evidence.count,0)::integer as evidence_count,
          coalesce(usage.input_tokens,0)::text as input_tokens,
          coalesce(usage.output_tokens,0)::text as output_tokens,
          coalesce(usage.cost_minor,0)::text as cost_minor,
          failure.failure_code,run.created_at,run.completed_at
         from kxra.agent_runs run
         join kxra.agent_manifests agent on agent.id=run.agent_id
         join kxra.skill_manifests skill on skill.id=run.skill_id
         left join kxra.projects project on project.id=run.project_id
         left join kxra.members member on member.id=run.initiated_by and member.org_id=run.org_id
         left join lateral(select count(*) from kxra.agent_run_attempts item where item.run_id=run.id) attempts on true
         left join lateral(select count(*) from kxra.agent_tool_calls item where item.run_id=run.id) tools on true
         left join lateral(select count(*) from kxra.evidence_envelope_items item
          join kxra.evidence_envelopes envelope on envelope.id=item.envelope_id where envelope.run_id=run.id) evidence on true
         left join lateral(select sum(item.input_tokens) as input_tokens,
          sum(item.output_tokens) as output_tokens,sum(item.cost_minor) as cost_minor
          from kxra.provider_usage_events item where item.run_id=run.id) usage on true
         left join lateral(select item.failure_code from kxra.run_failures item
          where item.run_id=run.id order by item.created_at desc,item.id desc limit 1) failure on true
         order by run.created_at desc,run.id desc limit 200`,
      );
      content = (
        <>
          <Heading
            title="Agent Run History"
            sub="Redacted authorization, execution, evidence, usage and delivery state."
          />
          <AgentRunHistoryView runs={runs} />
        </>
      );
    } else if (modules[section]) {
      const [title, kind] = modules[section];
      if (section === "finance") owner(a);
      const rows = await listRecords(a, kind, filter);
      const cash = section === "finance" ? await totals(a) : [];
      content = (
        <>
          <Heading
            title={title}
            sub={
              section === "runs"
                ? "Only recorded runs appear here. No agents are running."
                : undefined
            }
          />
          {section === "finance" && (
            <div className="panel">
              <h2>Recorded net cash movement</h2>
              {cash.length ? (
                cash.map(({ currency: c, total: v }) => (
                  <p key={c}>
                    {c} {v}
                  </p>
                ))
              ) : (
                <p>
                  Unknown — no actual entries recorded. Estimates and paper
                  results are excluded.
                </p>
              )}
              <p className="subtle">
                Currencies are kept separate. This is not a bank balance or
                profit forecast.
              </p>
            </div>
          )}
          <Records rows={rows} projects={projects} />
          {!["run", "experiment", "decision", "task"].includes(kind) &&
            (a.role === "owner" ||
              (["idea", "note"].includes(kind) &&
                writableProjects.length > 0)) && (
              <div style={{ marginTop: 24 }}>
                <RecordForm
                  kind={kind}
                  projects={writableProjects}
                  pid={filter}
                  partner={a.role !== "owner"}
                />
              </div>
            )}
        </>
      );
    } else if (section === "record" && segments[1]) {
      const r = await getRecord(a, segments[1]);
      const versions = await query<{
        version: number;
        title: string;
        body: string;
        data: Record<string, unknown>;
        classification: string | null;
        status: string | null;
        editor_id: string | null;
        editor_name: string | null;
        created_at: string;
      }>(
        a,
        `select v.version,v.title,v.body,v.data,v.classification::text,v.status,
                v.editor_id,m.display_name as editor_name,v.created_at
         from kxra.record_versions v left join kxra.members m on m.id=v.editor_id
         where v.record_id=$1 order by v.version desc`,
        [r.id],
      );
      const requestedVersion = queryParameters.version
        ? Number(queryParameters.version)
        : null;
      const historical = requestedVersion
        ? versions.find((version) => version.version === requestedVersion)
        : null;
      if (
        requestedVersion &&
        (!Number.isSafeInteger(requestedVersion) || !historical)
      )
        notFound();
      const displayed = historical || r;
      content = (
        <>
          <Heading
            title={displayed.title}
            sub={`${r.kind} · ${displayed.classification || "Legacy classification unavailable"}${historical ? ` · historical version ${historical.version}` : ""}`}
          />
          {historical && (
            <p className="notice">
              This is an immutable historical snapshot.{" "}
              <Link href={`/os/record/${r.id}`}>
                Return to current version.
              </Link>
            </p>
          )}
          <article className="record">
            <p>{displayed.body}</p>
            <span className="badge">
              {displayed.status || "Legacy status unavailable"} · v
              {historical?.version || r.version} · {r.visibility}
            </span>
            <details>
              <summary>Structured evidence and provenance</summary>
              <pre>{JSON.stringify(displayed.data, null, 2)}</pre>
            </details>
            {!historical &&
              a.role === "owner" &&
              ["draft", "submitted"].includes(r.status) && (
                <div className="record-actions">
                  <ActionButton
                    url="/api/approvals"
                    payload={{
                      action: "record.accept",
                      project_id: r.project_id,
                      payload: { record_id: r.id, version: r.version },
                    }}
                    label="Request acceptance approval"
                  />
                </div>
              )}
            {!historical &&
              a.role === "owner" &&
              r.status === "accepted" &&
              typeof r.data.gate === "string" &&
              [
                "P002_LISTING",
                "P003_FAITHFUL_DELIVERY",
                "P005_LOCAL_PROTOTYPE",
              ].includes(r.data.gate) && (
                <div className="record-actions">
                  <ActionButton
                    url="/api/approvals"
                    payload={{
                      action: "project.gate",
                      project_id: r.project_id,
                      payload: {
                        gate: r.data.gate,
                        evidence_id: r.id,
                        evidence_version: r.version,
                      },
                    }}
                    label="Request local gate authorization"
                  />
                </div>
              )}
          </article>
          {!historical &&
            ["draft", "submitted"].includes(r.status) &&
            (a.role === "owner" ||
              (r.created_by === a.id &&
                writableProjects.some((p) => p.id === r.project_id))) && (
              <EditRecordForm record={r} />
            )}
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Version history</h2>
            {versions.map((v) => (
              <div className="list-item" key={v.version}>
                <Link href={`/os/record/${r.id}?version=${v.version}`}>
                  Version {v.version}
                </Link>
                <p>
                  {v.classification || "Legacy classification unavailable"} ·{" "}
                  {v.status || "Legacy status unavailable"} ·{" "}
                  {v.editor_name ||
                    (v.editor_id ? "Attributed member" : "System migration")}
                  {" · "}
                  {new Date(v.created_at).toLocaleString("en-GB")}
                </p>
              </div>
            ))}
          </div>
        </>
      );
    } else if (section === "ask") {
      content = (
        <>
          <Heading
            title="Ask KXRA"
            sub="Find source-linked evidence within your current access."
          />
          <p className="notice">
            Evidence search is working.{" "}
            {localMode()
              ? "Deterministic fake-model synthesis is available for local acceptance testing; no external model is called."
              : "External AI synthesis and paid model calls are disabled until a provider is configured."}
          </p>
          <AskForm projects={projects} synthesisEnabled={localMode()} />
        </>
      );
    } else if (section === "files") {
      if (filter) await project(a, filter);
      const files = await query<{
        id: string;
        filename: string;
        lifecycle_state: string;
        state_reason_code: string | null;
        size_bytes: number;
      }>(
        a,
        `select id,filename,lifecycle_state,state_reason_code,size_bytes
         from kxra.files where ($1::uuid is null or project_id=$1)
         order by created_at desc`,
        [filter || null],
      );
      content = (
        <>
          <Heading
            title="Project files"
            sub="Private files follow the permissions of their project record."
          />
          <div className="panel">
            {files.length ? (
              files.map((f) => (
                <div className="list-item" key={f.id}>
                  <Link href={"/api/files/" + f.id}>{f.filename}</Link>{" "}
                  <span className="badge">{f.lifecycle_state}</span>
                  <p>{f.size_bytes} bytes</p>
                  {f.state_reason_code && (
                    <p className="subtle">{f.state_reason_code}</p>
                  )}
                </div>
              ))
            ) : (
              <p>No files uploaded.</p>
            )}
          </div>
          {writableProjects.length > 0 && (
            <UploadForm
              projects={writableProjects}
              pid={filter}
              owner={a.role === "owner"}
            />
          )}
        </>
      );
    } else if (section === "approvals") {
      owner(a);
      await query(a, "select kxra.refresh_expired_approvals()", []);
      const rows = await query<{
        id: string;
        action: string;
        state: string;
        project_id: string | null;
        payload: Record<string, unknown>;
        payload_hash: string;
        expires_at: string;
        project_code: string | null;
        target_name: string | null;
        requester_name: string | null;
        created_at: string;
      }>(
        a,
        `select a.*,p.code as project_code,
                coalesce(r.title,m.display_name) as target_name,
                requester.display_name as requester_name
         from kxra.approvals a
         left join kxra.projects p on p.id=a.project_id
         left join kxra.records r on r.id=nullif(a.payload->>'record_id','')::uuid
         left join kxra.members m on m.id=nullif(a.payload->>'user_id','')::uuid
         left join kxra.members requester on requester.id=a.requested_by and requester.org_id=a.org_id
         order by a.created_at desc`,
      );
      content = (
        <>
          <Heading
            title="Approvals"
            sub="Review the exact action. Consequential changes require owner MFA."
          />
          {rows.map((r) => (
            <article className="record" key={r.id} id={`approval-${r.id}`}>
              <h3>
                {String(r.payload.action_summary || "") ||
                  (r.action === "record.accept"
                    ? "Accept record"
                    : r.action === "membership.change"
                      ? "Change project access"
                      : r.action === "project.gate"
                        ? "Authorize local project gate"
                        : r.action)}
              </h3>
              <span className="badge">{r.state}</span>
              <dl className="definition">
                <dt>Action</dt>
                <dd>{r.action}</dd>
                <dt>Requester</dt>
                <dd>{r.requester_name || "Unknown requester"}</dd>
                <dt>Project</dt>
                <dd>{r.project_code || "KXRA Group"}</dd>
                <dt>Requested</dt>
                <dd>{new Date(r.created_at).toLocaleString("en-GB")}</dd>
                <dt>Expires</dt>
                <dd>{new Date(r.expires_at).toLocaleString("en-GB")}</dd>
                <dt>Target / recipient</dt>
                <dd>
                  {r.payload.recipient
                    ? JSON.stringify(r.payload.recipient)
                    : r.target_name || "Not applicable"}
                </dd>
                <dt>Before</dt>
                <dd>
                  <code>
                    {r.payload.before
                      ? JSON.stringify(r.payload.before)
                      : "Legacy envelope — not supplied"}
                  </code>
                </dd>
                <dt>After</dt>
                <dd>
                  <code>
                    {r.payload.after
                      ? JSON.stringify(r.payload.after)
                      : "Legacy envelope — not supplied"}
                  </code>
                </dd>
                <dt>Estimated cost</dt>
                <dd>
                  {r.payload.estimated_cost
                    ? `${String(r.payload.cost_currency || "")} ${String(r.payload.estimated_cost)}`.trim()
                    : "Not applicable"}
                </dd>
                <dt>Risk</dt>
                <dd>
                  {String(
                    r.payload.risk_summary || "Legacy envelope — not supplied",
                  )}
                </dd>
              </dl>
              <details>
                <summary>Exact signed envelope</summary>
                <pre>{JSON.stringify(r.payload, null, 2)}</pre>
                <p className="subtle">Digest: {r.payload_hash}</p>
              </details>
              {r.state === "REQUESTED" && (
                <div className="record-actions">
                  <ActionButton
                    url={"/api/approvals/" + r.id}
                    payload={{ hash: r.payload_hash, approve: true }}
                    label="Approve"
                  />
                  <ActionButton
                    url={"/api/approvals/" + r.id}
                    payload={{ hash: r.payload_hash, approve: false }}
                    label="Reject"
                  />
                </div>
              )}
              {r.state === "APPROVED" &&
                [
                  "record.accept",
                  "membership.change",
                  "project.gate",
                  "account.lifecycle",
                  "idea.share",
                  "project.governance",
                ].includes(r.action) && (
                  <ActionButton
                    url={"/api/approvals/" + r.id + "/execute"}
                    payload={{}}
                    label="Execute approved action"
                  />
                )}
            </article>
          ))}
          {!rows.length && (
            <div className="empty">
              No approval requests. Request acceptance from a draft record.
            </div>
          )}
        </>
      );
    } else if (section === "partners") {
      owner(a);
      const members = await query<{
        id: string;
        display_name: string;
        active: boolean;
        access_version: number;
        account_state: string;
        first_name: string | null;
        last_name: string | null;
        job_title: string | null;
        company: string | null;
        mfa_state: string;
        onboarding_completed_at: string | null;
        session_version: number;
      }>(
        a,
        `select member.id,member.display_name,member.active,member.access_version,
          profile.account_state,profile.first_name,profile.last_name,profile.job_title,
          profile.company,profile.mfa_state,profile.onboarding_completed_at,
          profile.session_version
         from kxra.members member join kxra.profiles profile on profile.user_id=member.id
         where member.role='partner' order by member.display_name,member.id`,
      );
      const memberships = await query<{
        user_id: string;
        project_id: string;
        active: boolean;
        role: "viewer" | "contributor";
        expires_at: string | null;
      }>(
        a,
        "select user_id,project_id,active,role,expires_at from kxra.project_memberships",
      );
      await query(a, "select kxra.refresh_expired_invitations()", []);
      const invitations = await query<{
        id: string;
        recipient_email: string;
        note: string | null;
        state: string;
        version: number;
        delivery_version: number;
        expires_at: string;
        sent_at: string | null;
        redeemed_at: string | null;
        revoked_at: string | null;
        grants: {
          project_id: string;
          project_code: string;
          project_name: string;
          role: string;
          expires_at: string | null;
        }[];
      }>(
        a,
        `select i.id,i.recipient_email,i.note,i.state,i.version,i.delivery_version,i.expires_at,
          i.sent_at,i.redeemed_at,i.revoked_at,
          coalesce(jsonb_agg(jsonb_build_object(
           'project_id',grant_row.project_id,'project_code',project.code,
           'project_name',project.name,'role',grant_row.role,
           'expires_at',grant_row.membership_expires_at
          ) order by project.code) filter(where grant_row.project_id is not null),'[]'::jsonb) as grants
         from kxra.invitations i
         left join kxra.invitation_project_grants grant_row on grant_row.invitation_id=i.id
         left join kxra.projects project on project.id=grant_row.project_id
         group by i.id order by i.created_at desc`,
      );
      content = (
        <>
          <Heading
            title="Partners"
            sub="Invitation, onboarding, project access and account lifecycle controls."
          />
          <InvitationForm projects={projects} />
          <InvitationList invitations={invitations} />
          <PartnerCards
            partners={members}
            memberships={memberships}
            projects={projects}
          />
          <p className="notice">
            Local email and authentication are deterministic provider doubles.
            They do not prove Supabase or Resend behavior. Membership and
            account lifecycle changes require exact owner approval and recent
            AAL2.
          </p>
        </>
      );
    } else if (section === "work-log") {
      owner(a);
      const page = Math.max(1, Number(queryParameters.page || 1) || 1);
      if (filter) await project(a, filter);
      const result = await listWorkLog(a, {
        project: filter,
        actor: queryParameters.actor,
        department: queryParameters.department,
        type: queryParameters.type,
        status: queryParameters.status,
        from: queryParameters.from,
        to: queryParameters.to,
        page,
        pageSize: 50,
      });
      content = (
        <>
          <Heading
            title="Work Log"
            sub="Durable, attributable events linked to the artifacts that produced them."
          />
          <WorkLogView
            result={result}
            filters={{
              project: filter,
              actor: queryParameters.actor,
              department: queryParameters.department,
              type: queryParameters.type,
              status: queryParameters.status,
              from: queryParameters.from,
              to: queryParameters.to,
            }}
            projects={projects}
          />
        </>
      );
    } else if (section === "activity") {
      const rows = await query<{
        id: string;
        action: string;
        created_at: string;
      }>(
        a,
        "select id,title as action,created_at from kxra.records where visibility='project_shared' order by updated_at desc limit 100",
      );
      content = (
        <>
          <Heading
            title="Project activity"
            sub="Records visible within your current project access."
          />
          <div className="panel">
            {rows.map((row) => (
              <div className="list-item" key={row.id}>
                <strong>{row.action}</strong>
                <p>{new Date(row.created_at).toLocaleString("en-GB")}</p>
              </div>
            ))}
          </div>
        </>
      );
    } else if (section === "whatsapp") {
      const [pairings, selections, messages, intents] = await Promise.all([
        query<{ state: string }>(
          a,
          "select state from kxra.whatsapp_gateway_pairings order by created_at desc limit 20",
        ),
        query<{ state: string }>(
          a,
          "select state from kxra.whatsapp_project_selections order by selected_at desc limit 50",
        ),
        query<{ state: string }>(
          a,
          "select state from kxra.whatsapp_messages order by created_at desc limit 50",
        ),
        query<{ state: string; delivery_state: string }>(
          a,
          "select state,delivery_state from kxra.whatsapp_outbound_intents order by created_at desc limit 50",
        ),
      ]);
      content = (
        <>
          <Heading
            title={
              a.role === "owner" ? "WhatsApp Gateway" : "WhatsApp Connection"
            }
          />
          <div className="notice warning">
            Meta transport is disabled. No inbound webhook, media fetch,
            transcription, model call or outbound send is connected.
          </div>
          <div className="metric-grid">
            {[
              ["Pairings", pairings.length],
              ["Project selections", selections.length],
              ["Inbound messages", messages.length],
              ["Outbound intents", intents.length],
            ].map(([label, value]) => (
              <div className="metric" key={String(label)}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="panel">
            <span className="badge amber">Transport disabled</span>
            <h2 style={{ marginTop: 20 }}>Governed gateway contract</h2>
            <p>
              One-use account pairing, explicit project selection, signed-event
              deduplication, supported intent records, media quarantine and
              consent, revocation, takeover and disabled outbound intents are
              enforced in PostgreSQL. Phone numbers are stored only as digests.
            </p>
            <p>
              Meta application identifiers, webhook registration, token custody
              and provider delivery require a controlled staging connection.
              Continue project conversations through Ask KXRA until then.
            </p>
            <Link href="/os/ask">Open Ask KXRA ↗</Link>
          </div>
        </>
      );
    } else if (section === "profile") {
      const [
        profileRows,
        preferenceRows,
        assignments,
        pairings,
        securityEvents,
      ] = await Promise.all([
        query<{
          first_name: string | null;
          last_name: string | null;
          job_title: string | null;
          company: string | null;
          phone: string | null;
          account_state: string;
          mfa_state: string;
          onboarding_completed_at: string | null;
        }>(
          a,
          `select first_name,last_name,job_title,company,phone,account_state,
              mfa_state,onboarding_completed_at from kxra.profiles where user_id=$1`,
          [a.id],
        ),
        query<{
          timezone: string;
          email_notifications: boolean;
          whatsapp_notifications: boolean;
          security_alerts: boolean;
          display_density: "comfortable" | "compact";
        }>(
          a,
          `select timezone,email_notifications,whatsapp_notifications,
              security_alerts,display_density from kxra.user_preferences where user_id=$1`,
          [a.id],
        ),
        query<{
          project_id: string;
          code: string;
          name: string;
          role: "viewer" | "contributor";
          active: boolean;
          expires_at: string | null;
        }>(
          a,
          `select membership.project_id,project.code,project.name,membership.role,
              membership.active,membership.expires_at
             from kxra.project_memberships membership
             join kxra.projects project on project.id=membership.project_id
             where membership.user_id=$1 order by project.code`,
          [a.id],
        ),
        query<{ id: string }>(
          a,
          `select id from kxra.whatsapp_pairings where user_id=$1
             and verified_at is not null and revoked_at is null`,
          [a.id],
        ),
        query<{
          event_type: string;
          metadata: Record<string, unknown>;
          created_at: string;
        }>(
          a,
          `select event_type,metadata,created_at from kxra.account_security_events
             where user_id=$1 order by created_at desc limit 20`,
          [a.id],
        ),
      ]);
      content = (
        <>
          <Heading
            title="Profile & account"
            sub="Manage personal details, preferences and provider-backed security controls."
          />
          <AccountControls
            profile={profileRows[0]}
            preferences={preferenceRows[0]}
            assignments={assignments}
            securityEvents={securityEvents}
            email={a.email}
            role={a.role}
            source={a.source}
            hasActivePairing={pairings.length > 0}
          />
        </>
      );
    } else if (section === "admin") {
      owner(a);
      const snapshot = await adminSnapshot(a);
      content = (
        <>
          <Heading
            title="Administration"
            sub="Owner-only account, security, environment and system health controls."
          />
          <AdminView snapshot={snapshot} />
        </>
      );
    } else notFound();
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403))
      content = (
        <>
          <Heading title="Not available" />
          <p>This resource is not available to your account.</p>
        </>
      );
    else throw e;
  }
  return (
    <Shell actor={a} active={section} local={localMode()}>
      {content}
    </Shell>
  );
}
