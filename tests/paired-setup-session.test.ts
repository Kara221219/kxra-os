import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const original = fs.readFileSync(
  "database/production/paired-setup-policy-v1.sql",
  "utf8",
);
const payload = fs.readFileSync(
  "database/production/paired-setup-session-v1.sql",
  "utf8",
);

test("additive session payload retains exact paired setup predicate plus one original-session condition", () => {
  const prior = original.slice(
    original.indexOf("create function kxra_paired_admission.setup_human"),
    original.indexOf("create function kxra_paired_admission.setup_policy"),
  );
  const expected = prior
    .replace("create function ", "create or replace function ")
    .replace(
      " and kxra_private.mfa_owner(o)",
      " and kxra_private.custom_app_original_session_current()\n and kxra_private.mfa_owner(o)",
    );
  assert.ok(payload.includes(expected));
  assert.equal((payload.match(/create or replace function/g) ?? []).length, 1);
  assert.equal((payload.match(/create function/g) ?? []).length, 1);
  assert.equal((payload.match(/create trigger/g) ?? []).length, 1);
  assert.doesNotMatch(
    payload,
    /\b(?:alter table|insert into|update kxra|delete from|drop|grant usage|grant select)\b/i,
  );
});

test("runtime helper uses exclusive paired fence before checking original session, without private grants", () => {
  const helper = payload.slice(
    payload.indexOf(
      "create function kxra_paired_admission.hosted_setup_session_current",
    ),
    payload.indexOf("revoke all on function"),
  );
  assert.match(
    helper,
    /language plpgsql volatile security definer set search_path=''/,
  );
  assert.match(helper, /if session_user<>'kxra_app' then return false;end if;/);
  const lockPosition = helper.indexOf("perform pg_advisory_xact_lock(");
  const checkPosition = helper.indexOf(
    "return coalesce(kxra_private.custom_app_original_session_current()",
  );
  assert.ok(lockPosition >= 0 && checkPosition >= 0);
  assert.ok(lockPosition < checkPosition);
  assert.doesNotMatch(
    helper,
    /pg_advisory_xact_lock_shared|kxra-custom-app-authority/,
  );
  assert.match(
    payload,
    /grant execute on function kxra_paired_admission.hosted_setup_session_current\(\) to authenticated;/,
  );
  assert.doesNotMatch(payload, /grant [^;]*kxra_private/);
});
