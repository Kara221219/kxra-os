import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const org = "10000000-0000-4000-8000-000000000001";
export const ids = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const fixtureEmails = {
  owner: "owner@fixture.invalid",
  partner: "partner@fixture.invalid",
  viewer: "viewer@fixture.invalid",
  revoked: "revoked@fixture.invalid",
};
export const mapping = {
  assumptions: "assumption",
  experiments: "experiment",
  decisions: "decision",
  risks: "risk",
  "research-sources": "source",
  blockers: "blocker",
  "ai-agents": "agent",
  skills: "skill",
  routines: "routine",
  "work-log": "work_log",
};
export function loadSeeds(root) {
  const dir = path.join(root, "KXRA-GENESIS/registers");
  return Object.fromEntries(
    ["projects", ...Object.keys(mapping)].map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")),
    ]),
  );
}
export function projectId(code) {
  if (!/^PROJECT-00[1-5]$/.test(code)) throw Error("Unknown project code");
  return "30000000-0000-4000-8000-00000000000" + code.slice(-1);
}
export function stableId(code) {
  const h = crypto
    .createHash("sha256")
    .update("kxra-genesis-v1:" + code)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function validateSeeds(bundle) {
  if (
    bundle["ai-agents"].length !== 13 ||
    bundle.skills.length !== 12 ||
    bundle.routines.length !== 9
  )
    throw Error("Unexpected Genesis registry counts");
  const codes = bundle.projects.map((x) => x.id);
  const expected = [
    "PROJECT-001",
    "PROJECT-002",
    "PROJECT-003",
    "PROJECT-004",
    "PROJECT-005",
  ];
  if (
    codes.length !== 5 ||
    new Set(codes).size !== 5 ||
    expected.some((x) => !codes.includes(x))
  )
    throw Error("Exactly PROJECT-001 through PROJECT-005 required");
  codes.forEach(projectId);
  const all = [
    ...bundle.projects,
    ...Object.keys(mapping).flatMap((k) => bundle[k]),
  ];
  const known = new Set(all.map((x) => x.id));
  if (known.size !== all.length) throw Error("Duplicate source code");
  const privateFoundationalSources = new Set([
    "SRC-001",
    "SRC-002",
    "SRC-003",
    "SRC-004",
    "SRC-005",
  ]);
  for (const project of bundle.projects) {
    if (
      project.venture_score !== null ||
      project.confidence_score !== null ||
      project.live_execution_enabled !== false ||
      project.partner_ids?.length
    )
      throw Error("Unsafe project seed state: " + project.id);
    for (const id of project.source_ids || [])
      if (!known.has(id) && !privateFoundationalSources.has(id))
        throw Error("Unknown project source reference: " + id);
  }
  for (const [file, kind] of Object.entries(mapping))
    for (const row of bundle[file]) {
      if (
        kind !== "agent" &&
        row.project_scope != null &&
        !["OS", ...codes].includes(row.project_scope)
      )
        throw Error("Unknown source scope: " + row.id);
      if (
        kind === "agent" &&
        row.project_scope?.startsWith("PROJECT-") &&
        !codes.includes(row.project_scope)
      )
        throw Error("Unknown source scope: " + row.id);
      for (const id of row.evidence_ids || [])
        if (!known.has(id)) throw Error("Unknown evidence reference: " + id);
      if (kind === "routine" && row.enabled !== false)
        throw Error("Seed routines must be disabled");
    }
}
// Caller owns the transaction; no commit or rollback occurs inside the importer.
export async function importSeeds(db, bundle, { failAfter = Infinity } = {}) {
  validateSeeds(bundle);
  let n = 0;
  await db.query(
    "insert into kxra.organisations(id,name) values($1,$2) on conflict(id) do nothing",
    [org, "KXRA Group"],
  );
  const digest = async (data) =>
    (
      await db.query(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as h",
        [data],
      )
    ).rows[0].h;
  const add = async (
    code,
    pid,
    kind,
    title,
    body,
    data,
    status = "draft",
    visibility = "owner_only",
  ) => {
    const classification = data.classification || "USER-SUPPLIED INFORMATION";
    const envelope = {
      kind,
      title,
      body,
      data,
      classification,
      status,
      visibility,
      project_id: pid,
    };
    const hash = await digest(envelope);
    const existing = (
      await db.query(
        "select id,project_id,kind::text,title,body,data,classification::text,status,visibility,provenance from kxra.records where source_code=$1",
        [code],
      )
    ).rows[0];
    if (existing) {
      const currentHash = await digest({
        kind: existing.kind,
        title: existing.title,
        body: existing.body,
        data: existing.data,
        classification: existing.classification,
        status: existing.status,
        visibility: existing.visibility,
        project_id: existing.project_id,
      });
      if (existing.provenance.source_hash !== hash || currentHash !== hash)
        throw Error("Seed provenance mismatch; review required: " + code);
      return;
    }
    await db.query(
      "insert into kxra.records(id,org_id,project_id,kind,title,body,data,classification,status,visibility,source_code,provenance,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,null)",
      [
        stableId(code),
        org,
        pid,
        kind,
        title,
        body,
        data,
        classification,
        status,
        visibility,
        code,
        {
          source_code: code,
          source_version: 1,
          source_hash: hash,
          authority: data.authority || "source_definition",
          importer: "genesis-v3",
        },
      ],
    );
    if (++n === failAfter) throw Error("Synthetic mid-import failure");
  };
  for (const p of bundle.projects) {
    const id = projectId(p.id),
      hash = await digest(p);
    const existing = (
      await db.query("select * from kxra.projects where id=$1", [id])
    ).rows[0];
    if (existing) {
      if (
        existing.code !== p.id ||
        existing.name !== p.name ||
        existing.stage !== p.stage ||
        existing.status !== p.status ||
        existing.next_action !== p.next_action ||
        existing.venture_score !== null ||
        existing.confidence_score !== null ||
        existing.live_execution_enabled !== false ||
        existing.product_creation_enabled !== false ||
        (existing.source_hash && existing.source_hash !== hash)
      )
        throw Error(
          "Project seed provenance mismatch; review required: " + p.id,
        );
      if (!existing.source_hash)
        await db.query(
          "update kxra.projects set source_code=$1,source_version=1,source_hash=$2,source_data=$3 where id=$4",
          [p.id, hash, p, id],
        );
    } else
      await db.query(
        "insert into kxra.projects(id,org_id,code,name,stage,status,next_action,source_code,source_version,source_hash,source_data) values($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10)",
        [
          id,
          org,
          p.id,
          p.name,
          p.stage,
          p.status,
          p.next_action,
          p.id,
          hash,
          p,
        ],
      );
    const gate = {
      "PROJECT-002": [
        "P002_LISTING",
        ["exact SKU", "fitment evidence", "safety evidence"],
      ],
      "PROJECT-003": [
        "P003_FAITHFUL_DELIVERY",
        ["rights confirmation", "geometry QA"],
      ],
      "PROJECT-005": [
        "P005_LOCAL_PROTOTYPE",
        ["specific buyer problem", "reviewed demand evidence"],
      ],
    }[p.id];
    if (gate)
      await db.query(
        "insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements) values($1,$2,$3,$4) on conflict(project_id,gate_code) do nothing",
        [org, id, gate[0], JSON.stringify(gate[1])],
      );
    await add(
      p.id + "-BRIEF",
      id,
      "knowledge",
      "Project next action",
      p.next_action,
      { next_action: p.next_action },
      "accepted",
      "project_shared",
    );
  }
  for (const [file, kind] of Object.entries(mapping))
    for (const row of bundle[file])
      await add(
        row.id,
        row.project_scope?.startsWith("PROJECT-")
          ? projectId(row.project_scope)
          : null,
        kind,
        row.title ||
          row.name ||
          row.role ||
          row.hypothesis ||
          row.missing ||
          row.action ||
          row.id,
        row.statement ||
          row.summary ||
          row.objective ||
          row.test ||
          row.decision ||
          row.why ||
          "",
        row,
        row.state === "accepted" && row.authority === "owner_directive"
          ? "accepted"
          : "draft",
      );
}
export async function seedFixtures(db) {
  for (const [key, id] of Object.entries(ids)) {
    const active = key !== "revoked";
    await db.query(
      `insert into kxra.members(id,org_id,display_name,role,active)
       values($1,$2,$3,$4,$5)
       on conflict(id) do update set display_name=excluded.display_name,
        role=excluded.role,active=excluded.active`,
      [id, org, `Local ${key}`, key === "owner" ? "owner" : "partner", active],
    );
    const emailDigest = crypto
      .createHash("sha256")
      .update(fixtureEmails[key])
      .digest("hex");
    await db.query(
      `insert into kxra.profiles(
        user_id,org_id,email_digest,first_name,last_name,job_title,company,
        account_state,email_verified_at,onboarding_completed_at,mfa_state
       ) values($1,$2,$3,$4,'Fixture','Local test account','KXRA fixture',$5,now(),now(),$6)
       on conflict(user_id) do update set email_digest=excluded.email_digest,
        first_name=excluded.first_name,last_name=excluded.last_name,
        job_title=excluded.job_title,company=excluded.company,
        account_state=excluded.account_state,email_verified_at=excluded.email_verified_at,
        onboarding_completed_at=excluded.onboarding_completed_at,mfa_state=excluded.mfa_state,
        updated_at=now()`,
      [
        id,
        org,
        emailDigest,
        `Local ${key}`,
        active ? "ACTIVE" : "REVOKED",
        key === "owner" ? "ENROLLED" : "NOT_ENROLLED",
      ],
    );
    await db.query(
      `insert into kxra.user_preferences(user_id,org_id)
       values($1,$2) on conflict(user_id) do nothing`,
      [id, org],
    );
    await db.query(
      `insert into kxra.onboarding_progress(
        user_id,org_id,current_step,completed_steps,whatsapp_choice,completed_at
       ) values($1,$2,9,array[1,2,3,4,5,6,7,8,9],'SKIP',now())
       on conflict(user_id) do nothing`,
      [id, org],
    );
  }

  const agreementFixtures = [
    [
      "80000000-0000-4000-8000-000000000001",
      "terms",
      "Terms placeholder — unapproved",
      "No KXRA legal terms have been approved. This local-only placeholder records that formal terms remain an owner and legal-review blocker.",
    ],
    [
      "80000000-0000-4000-8000-000000000002",
      "privacy",
      "Privacy placeholder — unapproved",
      "No KXRA privacy notice has been approved. This local-only placeholder records that a reviewed privacy notice is still required before production onboarding.",
    ],
  ];
  for (const [id, key, title, body] of agreementFixtures) {
    await db.query(
      `insert into kxra.agreement_documents(
        id,org_id,document_key,version,title,body,status,required
       ) values($1,$2,$3,1,$4,$5,'UNAPPROVED_PLACEHOLDER',true)
       on conflict(org_id,document_key,version) do update set
        title=excluded.title,body=excluded.body,status=excluded.status,
        required=excluded.required`,
      [id, org, key, title, body],
    );
    await db.query(
      `insert into kxra.legal_documents(
        id,org_id,document_type,audience,jurisdiction,version,title,
        rendered_content,content_sha256,status
       ) values(
        $1,$2,case $3 when 'terms' then 'TERMS' when 'privacy' then 'PRIVACY' else 'NDA' end,
        'ALL','GB',1,$4,$5,$6,'UNAPPROVED_PLACEHOLDER'
       ) on conflict(id,version) do nothing`,
      [
        id,
        org,
        key,
        title,
        body,
        crypto.createHash("sha256").update(body).digest("hex"),
      ],
    );
  }

  for (const user of [ids.partner, ids.viewer])
    for (const [agreementId] of agreementFixtures)
      await db.query(
        `insert into kxra.agreement_acceptances(
          user_id,org_id,agreement_id,agreement_version
         ) values($1,$2,$3,1) on conflict do nothing`,
        [user, org, agreementId],
      );

  for (const [who, code, role, active] of [
    ["partner", "PROJECT-002", "contributor", true],
    ["viewer", "PROJECT-003", "viewer", true],
    ["revoked", "PROJECT-002", "contributor", false],
  ])
    await db.query(
      "insert into kxra.project_memberships(org_id,project_id,user_id,role,active) values($1,$2,$3,$4,$5) on conflict(project_id,user_id) do nothing",
      [org, projectId(code), ids[who], role, active],
    );
}
