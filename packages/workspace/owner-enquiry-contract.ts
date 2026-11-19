export const enquiryStatuses = [
  "AWAITING_REVIEW",
  "UNVERIFIED",
  "REVIEWING",
  "CLOSED",
  "SPAM",
] as const;
export const enquiryTypes = ["ENQUIRY", "CUSTOM_PROJECT", "CONTACT"] as const;
export const enquiryPageSize = 25;
export const enquiryMaxPage = 1_000_000;
export type EnquiryFilters = {
  status?: (typeof enquiryStatuses)[number];
  type?: (typeof enquiryTypes)[number];
  page: number;
  enquiry?: string;
};
export class EnquiryParametersError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function enquiryFilters(
  input: Record<string, string | string[] | undefined>,
): EnquiryFilters {
  function single(key: string) {
    const value = input[key];
    if (Array.isArray(value))
      throw new EnquiryParametersError("Use one value per filter.");
    return value === "" ? undefined : value;
  }
  const status = single("status"),
    type = single("type"),
    rawPage = single("page"),
    enquiry = single("enquiry");
  if (status !== undefined && !enquiryStatuses.includes(status as never))
    throw new EnquiryParametersError("Choose a listed status.");
  if (type !== undefined && !enquiryTypes.includes(type as never))
    throw new EnquiryParametersError("Choose a listed submission type.");
  if (
    rawPage !== undefined &&
    (!/^[1-9][0-9]{0,6}$/.test(rawPage) || Number(rawPage) > enquiryMaxPage)
  )
    throw new EnquiryParametersError("Choose a valid page.");
  if (enquiry !== undefined && !uuid.test(enquiry))
    throw new EnquiryParametersError("Choose a valid enquiry.");
  return {
    status: status as EnquiryFilters["status"],
    type: type as EnquiryFilters["type"],
    page: rawPage ? Number(rawPage) : 1,
    enquiry: enquiry?.toLowerCase(),
  };
}
export function enquiryHref(
  filters: EnquiryFilters,
  change: Partial<EnquiryFilters> = {},
) {
  const next = enquiryFilters({
    ...Object.fromEntries(
      Object.entries({ ...filters, ...change }).map(([k, v]) => [
        k,
        v === undefined ? undefined : String(v),
      ]),
    ),
  });
  const params = new URLSearchParams();
  if (next.status) params.set("status", next.status);
  if (next.type) params.set("type", next.type);
  if (next.page !== 1) params.set("page", String(next.page));
  if (next.enquiry) params.set("enquiry", next.enquiry);
  return (
    "/os/enquiries" +
    (params.size ? "?" + params.toString() : "") +
    (next.enquiry ? "#public-enquiry-" + next.enquiry : "")
  );
}
// One SQL statement: the count remains available even when the requested page
// is empty, and rows/count share one statement snapshot. Later GETs are live.
export const ownerEnquiriesSql = `with matching as (
 select id,form_kind,status,name,email,company,message,source_path,consent_recorded_at,received_at
 from kxra.public_enquiry_submissions where org_id=$1
 and ($2::text is null or status=$2 or ($2='AWAITING_REVIEW' and status in ('UNVERIFIED','REVIEWING')))
 and ($3::text is null or form_kind=$3)
), page_rows as (
 select * from matching order by received_at desc,id desc limit 25 offset $4
)
select (select count(*)::text from matching) total_count,
 coalesce((select jsonb_agg(row_to_json(p) order by received_at desc,id desc) from page_rows p),'[]'::jsonb) rows`;
export function enquiryQueryValues(orgId: string, filters: EnquiryFilters) {
  return [
    orgId,
    filters.status ?? null,
    filters.type ?? null,
    (filters.page - 1) * enquiryPageSize,
  ];
}
