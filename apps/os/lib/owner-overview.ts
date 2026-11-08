import { localMode, query, scoped } from "../../../packages/db";
import {
  ownerOverviewFromRow,
  ownerOverviewSql,
} from "../../../packages/workspace/owner-overview-contract";
import { HttpError, owner, type Actor } from "./auth";
import {
  listPublicEnquiries,
  workLogHref,
  type PublicEnquiryRow,
  type WorkLogRow,
} from "./control-plane";

function ownerScope(a: Actor) {
  owner(a);
  if (a.organisation_kind !== "KXRA")
    throw new HttpError(403, "Access unavailable", "OWNER_REQUIRED");
}

export async function ownerEnquiryInbox(a: Actor, enquiry?: string) {
  ownerScope(a);
  if (enquiry === undefined) return listPublicEnquiries(a);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      enquiry,
    )
  )
    throw new HttpError(404, "Enquiry unavailable");
  const rows = await query<PublicEnquiryRow>(
    a,
    `select id,form_kind,status,name,email,company,message,source_path,
    consent_recorded_at,received_at from kxra.public_enquiry_submissions
    where org_id=$1 and id=$2 limit 1`,
    [a.org_id, enquiry],
  );
  if (!rows.length) throw new HttpError(404, "Enquiry unavailable");
  return rows;
}

export async function ownerOverview(a: Actor) {
  ownerScope(a);
  return scoped(a, async (db) => {
    const result = await db.query(ownerOverviewSql, [a.org_id]);
    if (result.rows.length !== 1) throw Error("Owner overview unavailable");
    return ownerOverviewFromRow(result.rows[0], {
      organisation: a.organisation_name,
      local: localMode(),
    });
  });
}

export async function ownerWorkLogEntry(a: Actor, entry: string) {
  ownerScope(a);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      entry,
    )
  )
    throw new HttpError(404, "Activity unavailable");
  const rows = await query<Omit<WorkLogRow, "href">>(
    a,
    `select w.id,w.project_id,p.code as project_code,w.entry_type,w.status,w.actor_id,
    m.display_name as actor_name,w.actor_kind,w.actor_label,w.department,w.title,
    w.artifact_type,w.artifact_id,w.metadata,w.occurred_at,'1'::text as total_count
    from kxra.work_log_entries w
    left join kxra.projects p on p.id=w.project_id
    left join kxra.members m on m.id=w.actor_id and m.org_id=w.org_id
    where w.org_id=$1 and w.id=$2 limit 1`,
    [a.org_id, entry],
  );
  if (!rows.length) throw new HttpError(404, "Activity unavailable");
  return {
    rows: rows.map((row) => ({
      ...row,
      href: workLogHref(row.artifact_type, row.artifact_id, row.id),
    })),
    page: 1,
    page_size: 1,
    total_count: 1,
  };
}
