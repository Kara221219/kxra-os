import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync(
  "database/proposals/business-admission.sql",
  "utf8",
);

test("admission policy publication is sticky and drafts do not count as current", () => {
  assert.match(sql, /first_enabled_at timestamptz/);
  assert.match(
    sql,
    /if new\.enabled and new\.first_enabled_at is null then new\.first_enabled_at=now\(\);end if;/,
  );
  assert.match(
    sql,
    /create trigger business_policy_immutable before insert or update or delete/,
  );
  assert.equal((sql.match(/new\.first_enabled_at=/g) || []).length, 1);
  assert.doesNotMatch(sql, /new\.first_enabled_at\s*=\s*null/i);
});

test("both admission decisions select newest ever-enabled policy before checking enablement", () => {
  const selector =
    "select id from kxra_private.business_eligibility_policies where first_enabled_at is not null order by sequence desc limit 1";
  assert.equal(sql.split(selector).length - 1, 2);
  assert.doesNotMatch(
    sql,
    /business_eligibility_policies where enabled order by sequence desc limit 1/,
  );
  assert.match(
    sql,
    /if not found or not p\.enabled or p\.effective_at>now\(\)/,
  );
  assert.match(sql, /where p\.id=r\.policy_id and p\.enabled/);
});

test("activation markers cannot be supplied, rewritten or cleared through policy writes", () => {
  assert.match(
    sql,
    /if tg_op='INSERT' then\s+if new\.first_enabled_at is not null then raise exception 'Policy activation marker is server-managed'/,
  );
  assert.match(
    sql,
    /if new\.first_enabled_at is distinct from old\.first_enabled_at/,
  );
  assert.match(
    sql,
    /to_jsonb\(new\)-array\['enabled','first_enabled_at'\]\) is distinct from \(to_jsonb\(old\)-array\['enabled','first_enabled_at'\]/,
  );
  assert.match(
    sql,
    /if tg_op='DELETE' then raise exception 'Business evidence is append-only'/,
  );
  assert.match(
    sql,
    /revoke all on kxra_private\.business_declarations,kxra_private\.business_eligibility_policies,kxra_private\.business_eligibility_reviews from public,anon,authenticated,kxra_billing_worker/,
  );
});
