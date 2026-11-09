import { query } from "../../../packages/db";
import {
  enquiryQueryValues,
  ownerEnquiriesSql,
  type EnquiryFilters,
} from "../../../packages/workspace/owner-enquiry-contract";
import { HttpError, owner, type Actor } from "./auth";
import type { PublicEnquiryRow } from "./control-plane";
import { ownerEnquiryInbox } from "./owner-overview";
export type EnquiryPage = { rows: PublicEnquiryRow[]; total: number };
export async function ownerEnquiries(
  a: Actor,
  filters: EnquiryFilters,
): Promise<EnquiryPage> {
  owner(a);
  if (a.organisation_kind !== "KXRA")
    throw new HttpError(403, "Access unavailable", "OWNER_REQUIRED");
  if (filters.enquiry)
    return { rows: await ownerEnquiryInbox(a, filters.enquiry), total: 1 };
  const result = await query<{ total_count: string; rows: PublicEnquiryRow[] }>(
    a,
    ownerEnquiriesSql,
    enquiryQueryValues(a.org_id, filters),
  );
  const row = result[0];
  if (
    !row ||
    !/^(0|[1-9][0-9]*)$/.test(row.total_count) ||
    !Number.isSafeInteger(Number(row.total_count)) ||
    !Array.isArray(row.rows) ||
    row.rows.length > 25
  )
    throw Error("Enquiry inbox unavailable");
  return { rows: row.rows, total: Number(row.total_count) };
}
