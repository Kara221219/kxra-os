import {
  bridgeCatalog,
  bridgeView,
  createBridgeRequest,
  bridgeMutation,
} from "../../../../lib/team-bridge";
import { caseCatalog, caseMutation } from "../../../../lib/team-cases";
import { actor, sameOrigin, HttpError } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import {
  teamRooms,
  teamDetail,
  teamConnections,
  createTeamRoom,
  saveTeamConnection,
  teamMutation,
  runTeamAgent,
  teamOperations,
  teamMessagePage,
} from "../../../../lib/team-workspace";
import { query } from "../../../../../../packages/db";
import { z } from "zod";
import {
  teamKnowledge,
  teamKnowledgeSearch,
  teamKnowledgeMutation,
  teamFileDownload,
} from "../../../../lib/team-knowledge";
import {
  teamMemories,
  teamMemoryRecall,
  teamMemoryMutation,
} from "../../../../lib/team-memory";
import {
  teamJobs,
  enqueueTeamJob,
  cancelTeamJob,
  drainTeamJobs,
} from "../../../../lib/team-jobs";
import {
  teamSchedules,
  proposeTeamSchedule,
  reviewTeamSchedule,
} from "../../../../lib/team-schedules";
import { teamAuditExport } from "../../../../lib/team-audit";
import { catalogInput } from "../../../../lib/team-catalog";
import { teamWorkflow, workflowMutation } from "../../../../lib/team-workflow";
import {
  workspacePilot,
  workspacePilotEvent,
} from "../../../../lib/workspace-pilot";
import { pilotBilling } from "../../../../lib/pilot-billing";
import {
  collaborationCatalog,
  collaborationMutation,
} from "../../../../lib/team-collaboration";
import { workspaceStart } from "../../../../lib/workspace-start";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  try {
    const p = (await ctx.params).path || [],
      method = req.method;
    if (method !== "GET") sameOrigin(req);
    const a = await actor();
    if (p.length >= 2 && p[1] === "bridge") {
      if (p.length === 2 && method === "GET")
        return privateJson(
          await bridgeCatalog(
            a,
            p[0],
            catalogInput(new URL(req.url).searchParams),
          ),
        );
      if (p.length === 2 && method === "POST")
        return privateJson(
          await createBridgeRequest(a, p[0], await readJson(req)),
          201,
        );
      if (p.length === 3 && method === "GET")
        return privateJson(await bridgeView(a, p[0], p[2]));
      if (p.length === 4 && method === "POST")
        return privateJson(
          await bridgeMutation(a, p[0], p[2], p[3], await readJson(req)),
          201,
        );
      throw new HttpError(405, "Method unavailable");
    }

    if (
      p.length === 2 &&
      /^(remodel|role|application|travel)-(records|actions|save|propose|review|execute)$/.test(
        p[1],
      )
    ) {
      const [prefix, operation] = p[1].split("-");
      const kind = (
        {
          remodel: "REMODEL",
          role: "ROLE",
          application: "APPLICATION",
          travel: "TRAVEL",
        } as const
      )[prefix as "remodel" | "role" | "application" | "travel"];
      if (
        method === "GET" &&
        (operation === "records" || operation === "actions")
      )
        return privateJson(
          await caseCatalog(
            a,
            p[0],
            kind,
            operation,
            catalogInput(new URL(req.url).searchParams),
          ),
        );
      if (method === "POST" && !["records", "actions"].includes(operation))
        return privateJson(
          await caseMutation(a, p[0], kind, operation, await readJson(req)),
          201,
        );
      throw new HttpError(405, "Method unavailable");
    }
    if (
      p.length === 2 &&
      /^(creator|sample)-(records|actions|save|propose|review|execute)$/.test(
        p[1],
      )
    ) {
      const [app, operation] = p[1].split("-");
      const kind = app === "creator" ? "CREATOR" : "SAMPLE";
      if (
        method === "GET" &&
        (operation === "records" || operation === "actions")
      )
        return privateJson(
          await collaborationCatalog(
            a,
            p[0],
            kind,
            operation,
            catalogInput(new URL(req.url).searchParams),
          ),
        );
      if (method === "POST" && !["records", "actions"].includes(operation))
        return privateJson(
          await collaborationMutation(
            a,
            p[0],
            kind,
            operation,
            await readJson(req),
          ),
          201,
        );
      throw new HttpError(405, "Method unavailable");
    }
    if (method === "GET" && p.length === 1 && p[0] === "start")
      return privateJson(await workspaceStart(a));
    if (
      method === "POST" &&
      p.length === 3 &&
      p[0] === "pilot" &&
      p[1] === "billing"
    )
      return privateJson(
        await pilotBilling(a, p[2].toUpperCase(), await readJson(req)),
      );
    if (method === "GET" && p.length === 1 && p[0] === "pilot")
      return privateJson(await workspacePilot(a));
    if (
      method === "POST" &&
      p.length === 2 &&
      p[0] === "pilot" &&
      p[1] === "events"
    )
      return privateJson(await workspacePilotEvent(a, await readJson(req)));
    if (
      method === "POST" &&
      p.length === 2 &&
      p[0] === "jobs" &&
      p[1] === "drain"
    )
      return privateJson(await drainTeamJobs(a, await readJson(req)));
    if (method === "GET" && p.length === 2 && p[1] === "audit-export")
      return await teamAuditExport(a, p[0], new URL(req.url).searchParams);
    if (
      p.length === 2 &&
      method === "GET" &&
      ["workflow-records", "workflow-actions"].includes(p[1])
    )
      return privateJson(
        await teamWorkflow(
          a,
          p[0],
          p[1] === "workflow-records" ? "records" : "actions",
          catalogInput(new URL(req.url).searchParams),
        ),
      );
    if (
      p.length === 2 &&
      method === "POST" &&
      [
        "lead",
        "conversion",
        "conversion-review",
        "conversion-execute",
      ].includes(p[1])
    )
      return privateJson(
        await workflowMutation(a, p[0], p[1], await readJson(req)),
        201,
      );
    if (p.length === 2 && p[1] === "schedules") {
      if (method === "GET")
        return privateJson(
          await teamSchedules(
            a,
            p[0],
            catalogInput(new URL(req.url).searchParams),
          ),
        );
      if (method === "POST")
        return privateJson(
          await proposeTeamSchedule(a, p[0], await readJson(req)),
          201,
        );
    }
    if (
      method === "POST" &&
      p.length === 3 &&
      p[1] === "schedules" &&
      p[2] === "review"
    )
      return privateJson(
        await reviewTeamSchedule(a, p[0], await readJson(req)),
      );
    if (p.length === 2 && p[1] === "jobs") {
      if (method === "GET")
        return privateJson(
          await teamJobs(a, p[0], catalogInput(new URL(req.url).searchParams)),
        );
      if (method === "POST")
        return privateJson(
          await enqueueTeamJob(a, p[0], await readJson(req)),
          201,
        );
    }
    if (
      method === "POST" &&
      p.length === 3 &&
      p[1] === "jobs" &&
      p[2] === "cancel"
    )
      return privateJson(await cancelTeamJob(a, p[0], await readJson(req)));
    if (method === "GET" && p.length === 2 && p[1] === "memories")
      return privateJson(await teamMemories(a, p[0]));
    if (method === "GET" && p.length === 2 && p[1] === "memory-recall") {
      const params = new URL(req.url).searchParams;
      if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
        throw new HttpError(400, "Invalid memory query");
      const v = z
        .object({ agent_id: z.string().uuid() })
        .strict()
        .parse(Object.fromEntries(params));
      return privateJson(await teamMemoryRecall(a, p[0], v.agent_id));
    }
    if (
      method === "POST" &&
      p.length === 2 &&
      ["memories", "memory-review"].includes(p[1])
    )
      return privateJson(
        await teamMemoryMutation(a, p[0], p[1], await readJson(req)),
        201,
      );
    if (method === "GET" && p.length === 3 && p[1] === "files")
      return await teamFileDownload(a, p[0], p[2]);
    if (method === "GET" && p.length === 2 && p[1] === "knowledge")
      return privateJson(await teamKnowledge(a, p[0]));
    if (method === "GET" && p.length === 2 && p[1] === "search") {
      const params = new URL(req.url).searchParams;
      if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
        throw new HttpError(400, "Invalid search query");
      return privateJson(
        await teamKnowledgeSearch(a, p[0], Object.fromEntries(params)),
      );
    }
    if (
      method === "POST" &&
      p.length === 2 &&
      ["files", "skills", "skill-review", "agent-skill"].includes(p[1])
    )
      return privateJson(
        await teamKnowledgeMutation(a, p[0], p[1], await readJson(req)),
        201,
      );
    if (p.length === 2 && p[1] === "messages" && method === "GET") {
      const params = new URL(req.url).searchParams;
      if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
        throw new HttpError(400, "Invalid history query");
      const v = z
        .object({ before: z.string().uuid().optional() })
        .strict()
        .parse(Object.fromEntries(params));
      return privateJson(await teamMessagePage(a, p[0], v.before));
    }
    if (p.length === 1 && p[0] === "overview" && method === "GET")
      return privateJson(await teamOperations(a));
    if (p[0] === "connections") {
      if (p.length === 1 && method === "GET")
        return privateJson(await teamConnections(a));
      if (p.length === 1 && method === "POST")
        return privateJson(
          await saveTeamConnection(a, await readJson(req)),
          201,
        );
      if (p.length === 2 && method === "POST") {
        const v = z
          .object({ enabled: z.boolean() })
          .strict()
          .parse(await readJson(req));
        await query(a, "select kxra.team_connection_toggle($1,$2)", [
          z.string().uuid().parse(p[1]),
          v.enabled,
        ]);
        return privateJson({ saved: true });
      }
    }
    if (!p.length) {
      if (method === "GET") return privateJson(await teamRooms(a));
      if (method === "POST")
        return privateJson(await createTeamRoom(a, await readJson(req)), 201);
    }
    if (p.length === 1 && method === "GET")
      return privateJson(await teamDetail(a, p[0]));
    if (p.length === 2 && method === "POST")
      return privateJson(
        p[1] === "run"
          ? await runTeamAgent(a, p[0], await readJson(req))
          : await teamMutation(a, p[0], p[1], await readJson(req)),
        201,
      );
    throw new HttpError(404, "Not found");
  } catch (e) {
    return safeHttpError(e);
  }
}
export const GET = handle,
  POST = handle;
