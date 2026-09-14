import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actor,
  owner,
  principal,
  recentOwnerMfa,
  sameOrigin,
  HttpError,
} from "../../../lib/auth";
import {
  listProjects,
  project,
  listRecords,
  getRecord,
  createRecord,
  search,
  approval,
  totals,
  counts,
  operatingLoop,
} from "../../../lib/data";
import { query, scoped, localMode } from "../../../../../packages/db";
import { uuid, recordInput } from "../../../../../packages/domain";
import { evidenceAnswer } from "../../../../../packages/ai";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const positiveVersion = z.number().int().positive();
const evidenceReference = z
  .object({ record_id: uuid, version: positiveVersion })
  .strict();
const evidenceList = z.array(evidenceReference).min(1).max(20);
const gateCode = z.enum([
  "P002_LISTING",
  "P003_FAITHFUL_DELIVERY",
  "P005_LOCAL_PROTOTYPE",
]);
const gateEvidenceBase = {
  project_id: uuid,
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(50000),
  evidence: evidenceList,
};
const gateEvidenceInput = z.discriminatedUnion("gate", [
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P002_LISTING"),
      claims: z
        .object({
          exact_sku: z.string().trim().min(1).max(240),
          fitment_verified: z.literal(true),
          safety_evidence_verified: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P003_FAITHFUL_DELIVERY"),
      claims: z
        .object({
          rights_confirmed: z.literal(true),
          geometry_qa_passed: z.literal(true),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...gateEvidenceBase,
      gate: z.literal("P005_LOCAL_PROTOTYPE"),
      claims: z
        .object({
          buyer_problem: z.string().trim().min(1).max(1000),
          demand_reviewed: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]);
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function body(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON required");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Body required");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100000) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
async function handle(req: Request, ctx: Context) {
  try {
    const { path: p } = await ctx.params;
    const url = new URL(req.url);
    const method = req.method;
    if (method !== "GET") sameOrigin(req);
    if (p[0] === "invitations" && p[1] === "redeem" && method === "POST") {
      const identity = await principal();
      if (!identity) throw new HttpError(401, "Sign in required");
      const input = z
        .object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,100}$/) })
        .strict()
        .parse(await body(req));
      const tokenHash = crypto
        .createHash("sha256")
        .update(input.token)
        .digest("hex");
      const rows = await query<{ project_id: string }>(
        identity,
        "select kxra.redeem_invitation($1) as project_id",
        [tokenHash],
      );
      return json(rows[0]);
    }
    const a = await actor();
    if (p[0] === "summary" && method === "GET") return json(await counts(a));
    if (p[0] === "finance-totals" && method === "GET") {
      owner(a);
      return json(await totals(a));
    }
    if (p[0] === "projects" && method === "GET")
      return json(p[1] ? await project(a, p[1]) : await listProjects(a));
    if (p[0] === "invitations") {
      owner(a);
      if (method === "GET")
        return json(
          await query(
            a,
            `select i.id,i.project_id,p.code as project_code,i.role,i.state,i.expires_at,i.created_at
             from kxra.invitations i join kxra.projects p on p.id=i.project_id
             order by i.created_at desc`,
          ),
        );
      if (method === "POST" && !p[1]) {
        recentOwnerMfa(a);
        const input = z
          .object({
            project_id: uuid,
            email: z.string().trim().email().max(320),
            role: z.enum(["viewer", "contributor"]),
            expires_hours: z.number().int().min(1).max(168).default(24),
          })
          .strict()
          .parse(await body(req));
        await project(a, input.project_id);
        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto
          .createHash("sha256")
          .update(token)
          .digest("hex");
        const expiry = new Date(Date.now() + input.expires_hours * 3600_000);
        const rows = await query<{ id: string; expires_at: string }>(
          a,
          "select * from kxra.create_invitation($1,$2,$3,$4,$5)",
          [input.project_id, input.email, input.role, tokenHash, expiry],
        );
        return json({ ...rows[0], token }, 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "project-gates") {
      if (method === "GET" && !p[1]) {
        const pid = uuid.parse(url.searchParams.get("project_id"));
        await project(a, pid);
        const [policies, authorizations] = await Promise.all([
          query(
            a,
            "select gate_code,policy_version,requirements,threshold_state from kxra.project_gate_policies where project_id=$1",
            [pid],
          ),
          query(
            a,
            "select id,gate_code,evidence_id,evidence_version,scope,created_at from kxra.project_gate_authorizations where project_id=$1 order by created_at desc",
            [pid],
          ),
        ]);
        return json({ policies, authorizations });
      }
      if (method === "POST" && p[1] === "evidence") {
        owner(a);
        const input = gateEvidenceInput.parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_gate_evidence_packet($1,$2,$3,$4,$5,$6) as id",
          [
            input.project_id,
            input.gate,
            input.title,
            input.summary,
            input.claims,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "workflow") {
      if (method === "GET" && !p[1]) {
        const pid = uuid.parse(url.searchParams.get("project_id"));
        return json(await operatingLoop(a, pid));
      }
      if (method === "POST" && p[1] === "ideas" && p[3] === "submit") {
        const target = uuid.parse(p[2]);
        const input = z
          .object({ version: positiveVersion })
          .strict()
          .parse(await body(req));
        const rows = await query<{
          id: string;
          version: number;
          status: string;
        }>(a, "select id,version,status from kxra.submit_idea($1,$2)", [
          target,
          input.version,
        ]);
        return json(rows[0]);
      }
      if (method === "POST" && p[1] === "experiments" && !p[2]) {
        owner(a);
        const input = z
          .object({
            project_id: uuid,
            idea_id: uuid,
            idea_version: positiveVersion,
            title: z.string().trim().min(1).max(240),
            hypothesis: z.string().trim().min(1).max(50000),
            cost_cap: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
            currency: z.enum(["GBP", "USD", "EUR"]),
            success_criteria: z.string().trim().min(1).max(5000),
            stop_criteria: z.string().trim().min(1).max(5000),
            evidence: evidenceList,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_experiment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id",
          [
            input.project_id,
            input.idea_id,
            input.idea_version,
            input.title,
            input.hypothesis,
            input.cost_cap,
            input.currency,
            input.success_criteria,
            input.stop_criteria,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "experiments" && p[3] === "results") {
        const experiment = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            outcome: z.enum(["success", "failure", "inconclusive", "stopped"]),
            observations: z.string().trim().min(1).max(50000),
            metric_value: z.string().trim().min(1).max(500),
            evidence: evidenceList,
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.record_experiment_result($1,$2,$3,$4,$5,$6) as id",
          [
            experiment,
            input.version,
            input.outcome,
            input.observations,
            input.metric_value,
            JSON.stringify(input.evidence),
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "tasks" && !p[2]) {
        owner(a);
        const input = z
          .object({
            context_id: uuid,
            context_version: positiveVersion,
            assignee_id: uuid,
            title: z.string().trim().min(1).max(240),
            acceptance_criteria: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.assign_workflow_task($1,$2,$3,$4,$5) as id",
          [
            input.context_id,
            input.context_version,
            input.assignee_id,
            input.title,
            input.acceptance_criteria,
          ],
        );
        return json(rows[0], 201);
      }
      if (method === "POST" && p[1] === "tasks" && p[3] === "complete") {
        const target = uuid.parse(p[2]);
        const input = z
          .object({
            version: positiveVersion,
            completion_note: z.string().trim().min(1).max(5000),
          })
          .strict()
          .parse(await body(req));
        await query(a, "select kxra.complete_workflow_task($1,$2,$3)", [
          target,
          input.version,
          input.completion_note,
        ]);
        return json({ ok: true });
      }
      if (method === "POST" && p[1] === "decisions" && !p[2]) {
        owner(a);
        const input = z
          .object({
            project_id: uuid,
            experiment_id: uuid,
            experiment_version: positiveVersion,
            result_id: uuid,
            title: z.string().trim().min(1).max(240),
            decision: z.string().trim().min(1).max(50000),
            evidence: evidenceList,
            supersedes_id: uuid.nullable().default(null),
          })
          .strict()
          .parse(await body(req));
        const rows = await query<{ id: string }>(
          a,
          "select kxra.create_linked_decision($1,$2,$3,$4,$5,$6,$7,$8) as id",
          [
            input.project_id,
            input.experiment_id,
            input.experiment_version,
            input.result_id,
            input.title,
            input.decision,
            JSON.stringify(input.evidence),
            input.supersedes_id,
          ],
        );
        return json(rows[0], 201);
      }
      throw new HttpError(404, "Not found");
    }
    if (p[0] === "records") {
      if (method === "GET")
        return json(
          p[1]
            ? await getRecord(a, p[1])
            : await listRecords(
                a,
                url.searchParams.get("kind") || undefined,
                url.searchParams.get("project_id") || undefined,
              ),
        );
      if (method === "POST" && !p[1])
        return json(await createRecord(a, await body(req)), 201);
      if (method === "PATCH" && p[1]) {
        const current = await getRecord(a, p[1]);
        const input = z
          .object({
            title: z.string().min(1).max(240),
            body: z.string().max(50000),
            data: z.record(z.string(), z.unknown()),
            version: z.number().int().positive(),
          })
          .strict()
          .parse(await body(req));
        recordInput.parse({
          title: input.title,
          body: input.body,
          data: input.data,
          kind: current.kind,
          project_id: current.project_id,
          classification: current.classification,
          visibility: current.visibility,
        });
        const rows = await query(
          a,
          "update kxra.records set title=$1,body=$2,data=$3 where id=$4 and version=$5 returning *",
          [input.title, input.body, input.data, current.id, input.version],
        );
        if (!rows[0])
          throw new HttpError(409, "Record changed or is no longer editable");
        return json(rows[0]);
      }
    }
    if (
      (p[0] === "search" && method === "GET") ||
      (p[0] === "ask" && method === "POST")
    ) {
      const input =
        p[0] === "ask"
          ? z
              .object({
                question: z.string().trim().min(1).max(500),
                project_id: uuid.nullable().optional(),
              })
              .strict()
              .parse(await body(req))
          : {
              question: url.searchParams.get("q") || "",
              project_id: url.searchParams.get("project_id"),
            };
      const rows = await search(
        a,
        input.question,
        input.project_id || undefined,
      );
      return json(p[0] === "ask" ? evidenceAnswer(input.question, rows) : rows);
    }
    if (p[0] === "approvals") {
      owner(a);
      if (method === "GET")
        return json(
          await query(
            a,
            "select * from kxra.approvals order by created_at desc limit 200",
          ),
        );
      if (method === "POST" && !p[1]) {
        const input = z
          .discriminatedUnion("action", [
            z
              .object({
                action: z.literal("record.accept"),
                project_id: uuid.nullable(),
                payload: z
                  .object({
                    record_id: uuid,
                    version: z.number().int().positive(),
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("project.gate"),
                project_id: uuid,
                payload: z
                  .object({
                    gate: gateCode,
                    evidence_id: uuid,
                    evidence_version: positiveVersion,
                  })
                  .strict(),
              })
              .strict(),
            z
              .object({
                action: z.literal("membership.change"),
                project_id: uuid,
                payload: z
                  .object({
                    user_id: uuid,
                    role: z.enum(["viewer", "contributor"]),
                    active: z.boolean(),
                    expires_at: z.string().datetime().nullable().optional(),
                  })
                  .strict(),
              })
              .strict(),
          ])
          .parse(await body(req));
        return json(await approval(a, input), 201);
      }
      if (p[1] && method === "POST") {
        uuid.parse(p[1]);
        recentOwnerMfa(a);
        if (p[2] === "execute") {
          z.object({})
            .strict()
            .parse(await body(req));
          const rows = await query<{ action: string }>(
            a,
            "select action from kxra.approvals where id=$1",
            [p[1]],
          );
          if (!rows[0]) throw new HttpError(404, "Not found");
          const fn =
            rows[0].action === "record.accept"
              ? "accept_record"
              : rows[0].action === "membership.change"
                ? "change_membership"
                : rows[0].action === "project.gate"
                  ? "authorize_project_gate"
                  : null;
          if (!fn)
            throw new HttpError(409, "Execution is disabled for this action");
          await query(a, `select kxra.${fn}($1)`, [p[1]]);
        } else {
          const v = z
            .object({
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              approve: z.boolean(),
            })
            .strict()
            .parse(await body(req));
          await query(a, "select kxra.decide_approval($1,$2,$3)", [
            p[1],
            v.hash,
            v.approve,
          ]);
        }
        return json({ ok: true });
      }
    }
    if (p[0] === "files") {
      if (method === "GET") {
        if (!p[1])
          return json(
            await query(
              a,
              "select id,project_id,filename,mime_type,size_bytes,scan_status from kxra.files order by created_at desc",
            ),
          );
        if (!uuid.safeParse(p[1]).success)
          throw new HttpError(404, "Not found");
        const rows = await query<{ scan_status: string }>(
          a,
          "select scan_status from kxra.files where id=$1",
          [p[1]],
        );
        if (!rows[0]) throw new HttpError(404, "Not found");
        throw new HttpError(
          423,
          "File delivery is disabled pending malware scanning and storage validation",
        );
      }
      if (method === "POST") {
        if (!localMode())
          throw new HttpError(503, "Hosted storage is not configured");
        const length = Number(req.headers.get("content-length"));
        if (!Number.isSafeInteger(length) || length <= 0 || length > 20980000)
          throw new HttpError(413, "File request must be at most 20 MB");
        // Bound actual bytes as well: content-length is untrusted.
        const reader = req.body?.getReader();
        if (!reader) throw new HttpError(400, "File required");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 20980000) {
            await reader.cancel();
            throw new HttpError(413, "File too large");
          }
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks);
        const form = await new Request(req.url, {
          method: "POST",
          headers: { "content-type": req.headers.get("content-type") || "" },
          body: buffer,
        }).formData();
        const allowedFields = new Set(["project_id", "visibility", "file"]);
        for (const key of form.keys())
          if (!allowedFields.has(key))
            throw new HttpError(400, "Invalid upload fields");
        if (
          form.getAll("project_id").length !== 1 ||
          form.getAll("visibility").length > 1 ||
          form.getAll("file").length !== 1
        )
          throw new HttpError(400, "Invalid upload fields");
        const pid = uuid.parse(form.get("project_id"));
        await project(a, pid);
        const visibility = z
          .enum(["owner_only", "project_shared"])
          .parse(
            form.get("visibility") ||
              (a.role === "owner" ? "owner_only" : "project_shared"),
          );
        if (a.role !== "owner" && visibility !== "project_shared")
          throw new HttpError(403, "Access unavailable");
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 20971520 || !file.size)
          throw new HttpError(
            400,
            "A nonempty file of at most 20 MB is required",
          );
        const filename =
          file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 240) ||
          "document";
        const id = crypto.randomUUID(),
          objectKey = `${pid}/${id}`;
        const content = Buffer.from(await file.arrayBuffer());
        const sha = crypto.createHash("sha256").update(content).digest("hex");
        const directory = path.join(
            process.env.KXRA_RUNTIME!,
            "quarantine",
            pid,
          ),
          destination = path.join(directory, id);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          const saved = await scoped(a, async (db) => {
            const r = await db.query(
              "insert into kxra.records(org_id,project_id,kind,title,body,classification,visibility,created_by) values($1,$2,'note',$3,'File in quarantine; not available to AI.','USER-SUPPLIED INFORMATION',$5,$4) returning id",
              [a.org_id, pid, filename, a.id, visibility],
            );
            const f = await db.query(
              "insert into kxra.files(id,org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,filename,scan_status",
              [
                id,
                a.org_id,
                pid,
                r.rows[0].id,
                filename,
                objectKey,
                file.type || "application/octet-stream",
                file.size,
                sha,
                a.id,
              ],
            );
            await fs.writeFile(destination, content, {
              flag: "wx",
              mode: 0o600,
            });
            return f.rows[0];
          });
          return json(saved, 201);
        } catch (e) {
          await fs.unlink(destination).catch(() => {});
          throw e;
        }
      }
    }
    if (p[0] === "partners" && method === "GET") {
      owner(a);
      return json(
        await query(
          a,
          "select id,display_name,active from kxra.members where role='partner'",
        ),
      );
    }
    if (p[0] === "whatsapp")
      throw new HttpError(503, "WhatsApp gateway is disabled");
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: "Invalid request fields" }, 400);
    const code = (e as { code?: string }).code;
    if (code === "42501") return json({ error: "Access unavailable" }, 403);
    if (["23503", "23505", "23514", "P0001", "22P02"].includes(code || ""))
      return json(
        { error: "Action conflicts with current state or permissions" },
        409,
      );
    console.error("KXRA request failed", {
      type: e instanceof Error ? e.name : "unknown",
      code,
    });
    return json({ error: "Request unavailable" }, 503);
  }
}
export { handle as GET, handle as POST, handle as PATCH };
