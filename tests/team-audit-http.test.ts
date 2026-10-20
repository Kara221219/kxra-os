import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { csvCell } from "../apps/os/lib/team-audit";
import { runtimeFile } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
after(() => admin.end());
test("audit CSV encoding neutralizes spreadsheet formulas and quotes delimiters", () => {
  for (const value of ["=1+1", " +SUM(A1)", "\t@command", "\r-2+3"])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), '""');
});
test("audit export is creator scoped, bounded, paginated and excludes raw details and identifiers", async () => {
  const f = await knowledgeFixture(false),
    owner = await knowledgeLogin("owner");
  await admin.query(
    "insert into kxra.team_events(org_id,room_id,actor_id,action,target_id,details) select r.org_id,r.id,r.created_by,case when x=1 then '=FORMULA' else 'team_schedules:UPDATE' end,'hidden-source-secret',jsonb_build_object('state',case when x=1 then '=BAD' else 'PAUSED' end,'prompt','neverexportprompt','lease_token','neverexporttoken','content_sha256','neverexporthash') from kxra.team_rooms r,generate_series(1,505) x where r.id=$1",
    [f.room],
  );
  const response = await req(`/${f.room}/audit-export`, f.cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition")!, /attachment/);
  const csv = await response.text();
  assert.equal(csv.split("\r\n").length, 502);
  assert.equal(
    csv.split("\r\n")[0],
    "event_id,created_at,event,state,status,active,enabled",
  );
  assert.ok(!/neverexport|hidden-source|lease_token|content_sha256/.test(csv));
  const next = response.headers.get("x-kxra-next-cursor");
  assert.match(next!, /^\d+$/);
  const earlier = await req(`/${f.room}/audit-export?before=${next}`, f.cookie);
  assert.equal(earlier.status, 200);
  const old = await earlier.text();
  assert.ok(old.includes('"REDACTED"'));
  assert.ok(!old.includes("=FORMULA"));
  assert.ok(!old.includes("=BAD"));
  const firstIds = new Set(
    csv
      .split("\r\n")
      .slice(1, -1)
      .map((r) => r.split(",")[0]),
  );
  assert.ok(
    old
      .split("\r\n")
      .slice(1, -1)
      .every((r) => !firstIds.has(r.split(",")[0])),
  );
  assert.equal(earlier.headers.get("x-kxra-next-cursor"), "");
  assert.equal((await req(`/${f.room}/audit-export`, owner)).status, 404);
  assert.equal((await req(`/${f.room}/audit-export`)).status, 401);
  for (const query of [
    "?before=-1",
    "?before=9999999999999999999",
    "?role=owner",
    "?before=1&before=2",
  ])
    assert.equal(
      (await req(`/${f.room}/audit-export${query}`, f.cookie)).status,
      400,
    );
  // Becoming a member does not give a noncreator export authority.
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: "20000000-0000-4000-8000-000000000001",
    active: true,
  });
  assert.equal((await req(`/${f.room}/audit-export`, owner)).status, 403);
});
