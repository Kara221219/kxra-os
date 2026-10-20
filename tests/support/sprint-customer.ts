import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import pg from "pg";
import { runtimeFile } from "./runtime";
export async function sprintCustomerFixture() {
  const db = new pg.Pool({
    ...JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
    user: os.userInfo().username,
  });
  const org = crypto.randomUUID(),
    owner = "20000000-0000-4000-8000-000000000001",
    partner = "20000000-0000-4000-8000-000000000002";
  await db.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Sprint test customer',$2)",
    [org, `sprint-${crypto.randomUUID()}`],
  );
  await db.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Sprint customer','AT_SPRINT')",
    [org, partner],
  );
  const membership = (
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','INTERNAL','ACTIVE','Sprint manager','AT_SPRINT') returning id",
      [org, owner],
    )
  ).rows[0].id;
  await db.query(
    "insert into kxra.capability_grants(org_id,membership_id,capability,resource_type,state,issued_by,reason) values($1,$2,'custom_project.manage','ORGANISATION','ACTIVE',$3,'Synthetic sprint test')",
    [org, membership, owner],
  );
  const document = crypto.randomUUID(),
    content = "Synthetic sprint project terms, test only.";
  await db.query(
    "insert into kxra.legal_documents(id,org_id,document_type,audience,jurisdiction,version,title,rendered_content,content_sha256,immutable_object_key,status,effective_at,owner_approval_reference,owner_approved_at) values($1,$2,'CUSTOM_PROJECT','ALL','GB',1,'Synthetic sprint terms',$3,$4,$5,'APPROVED',now(),'SYNTHETIC_TEST_APPROVAL',now())",
    [
      document,
      org,
      content,
      crypto.createHash("sha256").update(content).digest("hex"),
      `synthetic://sprint/${document}`,
    ],
  );
  return {
    org,
    async close() {
      try {
        await db.query(
          "update kxra.organisation_memberships set state='REVOKED',revoked_at=now(),version=version+1 where org_id=$1 and state='ACTIVE'",
          [org],
        );
      } finally {
        await db.end();
      }
    },
  };
}
