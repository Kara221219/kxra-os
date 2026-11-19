import assert from "node:assert/strict";

type FixtureMembership = {
  membership: string;
  organisation: string;
  account: string;
};
type Query = (
  text: string,
  values: string[],
) => Promise<{ rowCount: number | null }>;

/** Test-only disposal: preserve selection audit FKs and leave other memberships alone. */
export async function retireFirstUseMembership(
  query: Query,
  scope: FixtureMembership,
) {
  const values = [scope.membership, scope.organisation, scope.account];
  for (const value of values)
    assert.match(
      value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  const result = await query(
    `update kxra.organisation_memberships
     set state='REVOKED',revoked_at=coalesce(revoked_at,now()),
      version=case when state='REVOKED' then version else version+1 end,
      updated_at=case when state='REVOKED' then updated_at else now() end
     where id=$1 and org_id=$2 and account_id=$3
      and grant_source='FIRST_USE_LOCAL_TEST'`,
    values,
  );
  assert.equal(
    result.rowCount,
    1,
    "FIRST_USE_FIXTURE_MEMBERSHIP_SCOPE_MISMATCH",
  );
}
