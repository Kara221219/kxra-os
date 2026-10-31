import assert from "node:assert/strict";
import type pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
const fixtureOrg = "10000000-0000-4000-8000-000000000001";
function guarded(config: pg.PoolConfig, environment: NodeJS.ProcessEnv) {
  assert.ok(
    localModeConfiguration(environment) && !environment.VERCEL_ENV,
    "Operations housekeeping requires generated local fixtures",
  );
  assert.ok(
    typeof config.host === "string" &&
      config.host.startsWith("/") &&
      !config.password &&
      !config.connectionString,
    "Operations housekeeping requires a private credential-free socket",
  );
}
/** Role-none discovery still needs explicit local FIXTURE funding context. */
export async function fixtureWorkerQuery(
  pool: pg.Pool,
  config: pg.PoolConfig,
  sql: string,
  values: unknown[] = [],
  environment: NodeJS.ProcessEnv = process.env,
) {
  guarded(config, environment);
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query(
      "select set_config('request.kxra.execution_mode','fixture',true)",
    );
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
/** Test-owned generated rows only. No deletion, global sweeps or identity reset. */
export class OperationsFixtureScope {
  private rooms = new Set<string>();
  private tenants = new Map<string, string>();
  constructor(
    private config: pg.PoolConfig,
    private environment: NodeJS.ProcessEnv = process.env,
  ) {}
  room(id: string) {
    assert.match(id, /^[0-9a-f-]{36}$/i);
    this.rooms.add(id);
  }
  tenant(id: string, actor: string) {
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.notEqual(
      id,
      fixtureOrg,
      "Never revoke a shared fixture organisation",
    );
    this.tenants.set(id, actor);
  }
  async cleanup(pool: pg.Pool) {
    guarded(this.config, this.environment);
    if (!this.rooms.size && !this.tenants.size) return;
    const rooms = [...this.rooms],
      tenants = [...this.tenants.keys()];
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("set local statement_timeout='5s'");
      // Each room was returned by this test's fixture builder, or belongs to a
      // random customer organisation registered BEFORE its first insert.
      const owned = await db.query(
        "select id,created_by from kxra.team_rooms where id=any($1::uuid[]) or org_id=any($2::uuid[])",
        [rooms, tenants],
      );
      for (const room of owned.rows) {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          room.created_by,
        ]);
        await db.query(
          "update kxra.team_execution_grants set revoked_at=coalesce(revoked_at,now()) where room_id=$1",
          [room.id],
        );
        await db.query(
          "update kxra.team_schedules set state='REVOKED',version=version+1,last_error='FIXTURE_CLEANUP' where room_id=$1 and state in ('DRAFT','ACTIVE','PAUSED')",
          [room.id],
        );
        await db.query(
          "update kxra.team_runs set status='CANCELLED',output='',error_code='FIXTURE_CLEANUP',finished_at=now() where room_id=$1 and status='RUNNING'",
          [room.id],
        );
        await db.query(
          "update kxra.team_job_attempts attempt set phase=case when job.state='DISPATCHED' then 'UNCERTAIN' else 'CANCELLED' end,error_code='FIXTURE_CLEANUP',finished_at=now() from kxra.team_jobs job where job.room_id=$1 and attempt.id=job.active_attempt and job.state in ('QUEUED','LEASED','DISPATCHED')",
          [room.id],
        );
        await db.query(
          "update kxra.team_jobs set state=case when state='DISPATCHED' then 'UNCERTAIN' else 'CANCELLED' end,last_error='FIXTURE_CLEANUP',lease_token=null,lease_expires_at=null,finished_at=now(),updated_at=now(),version=version+1 where room_id=$1 and state in ('QUEUED','LEASED','DISPATCHED')",
          [room.id],
        );
      }
      for (const [tenant, actor] of this.tenants) {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
          actor,
        ]);
        await db.query(
          "update kxra.organisation_memberships set state='REVOKED',revoked_at=coalesce(revoked_at,now()),version=version+1 where org_id=$1 and account_id=$2",
          [tenant, actor],
        );
        await db.query(
          "update kxra.organisations set state='CLOSED' where id=$1 and organisation_kind='CUSTOMER' and slug=$2",
          [tenant, "byok-" + tenant],
        );
      }
      const remaining = await db.query(
        "select (select count(*) from kxra.team_jobs where (room_id=any($1::uuid[]) or org_id=any($2::uuid[])) and state in ('QUEUED','LEASED','DISPATCHED'))+(select count(*) from kxra.team_execution_grants where (room_id=any($1::uuid[]) or org_id=any($2::uuid[])) and revoked_at is null)+(select count(*) from kxra.organisation_memberships where org_id=any($2::uuid[]) and state='ACTIVE' and revoked_at is null) n",
        [owned.rows.map((r) => r.id), tenants],
      );
      assert.equal(
        Number(remaining.rows[0].n),
        0,
        "Owned operations fixtures must leave no executable work or extra active memberships",
      );
      await db.query("commit");
      this.rooms.clear();
      this.tenants.clear();
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
}
