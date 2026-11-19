import { createHash } from "node:crypto";
import { z } from "zod";
import type { Principal } from "../db";

/**
 * DEFAULT-OFF METADATA ONLY: customer workspaces are organisations, never rooms.
 * This new cross-tenant read surface needs separate SQL/ACL/authority review.
 * No migration, grant, environment default, or lifecycle mutation ships here.
 * The server-only UI adapter reuses actor/query; live SQL activation remains separate.
 */
export const customerDirectoryVersion = 1 as const;
export const customerDirectoryMaximumPageSize = 50;
const cursorPurpose = "owner-customer-directory";
const cursorLifetimeMs = 15 * 60_000;
const uuid = z.uuid().regex(/^[0-9a-f-]+$/); // Canonical ordering matches PostgreSQL UUID bytes.
const timestamp = z.iso
  .datetime()
  .max(27)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/);
export const customerOrganisationState = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
]);

export const customerDirectoryInputV1 = z
  .object({
    version: z.literal(customerDirectoryVersion),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(customerDirectoryMaximumPageSize)
      .default(25),
    organisation_state: customerOrganisationState.optional(),
    cursor: z
      .string()
      .min(1)
      .max(768)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();

/**
 * These are stored organisation states, not account/membership states, payment,
 * entitlement, access or deletion guarantees. CUSTOMER kind may describe a
 * PARTNER/CLIENT relationship; it does not mean a paying customer.
 * There is no organisation.created_at in the accepted schema.
 */
export const customerWorkspaceMetadataV1 = z
  .object({
    organisation_id: uuid,
    name: z
      .string()
      .min(1)
      .max(240)
      .refine(
        (value) =>
          value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value),
      ),
    slug: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    relationship_type: z.enum(["INTERNAL", "PARTNER", "CUSTOMER", "CLIENT"]),
    organisation_state: customerOrganisationState,
    updated_at: timestamp,
  })
  .strict();

export const customerDirectoryPageV1 = z
  .object({
    version: z.literal(customerDirectoryVersion),
    consistency: z.literal("LIVE"),
    sampled_at: timestamp,
    items: z
      .array(customerWorkspaceMetadataV1)
      .max(customerDirectoryMaximumPageSize),
    page_size: z.number().int().min(1).max(customerDirectoryMaximumPageSize),
    has_more: z.boolean(),
    next_cursor: z
      .string()
      .min(1)
      .max(768)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable(),
  })
  .strict()
  .refine((page) => page.items.length <= page.page_size)
  .refine((page) => !page.has_more || page.items.length === page.page_size)
  .refine((page) => page.has_more === (page.next_cursor !== null));
export type CustomerDirectoryPage = z.infer<typeof customerDirectoryPageV1>;

const databasePage = z
  .object({
    version: z.literal(customerDirectoryVersion),
    sampled_at: timestamp,
    // The lookahead is included and validated, but never returned as an item.
    items: z
      .array(
        customerWorkspaceMetadataV1
          .extend({
            organisation_kind: z.literal("CUSTOMER"),
          })
          .strict(),
      )
      .max(customerDirectoryMaximumPageSize + 1),
    has_more: z.boolean(),
  })
  .strict();
const bookmark = z
  .object({
    version: z.literal(customerDirectoryVersion),
    purpose: z.literal(cursorPurpose),
    after_organisation_id: uuid,
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    issued_at: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - cursorLifetimeMs),
  })
  .strict();

export type CustomerDirectoryActor = Principal & {
  organisation_id: string;
  org_id: string;
  membership_id: string;
  access_version: number;
  security_role: string;
  organisation_kind: string;
  relationship_type: string;
  account_state: string;
};
const actorShape = z.object({
  id: uuid,
  source: z.literal("supabase"),
  aal: z.literal("aal2"),
  organisation_id: uuid,
  org_id: uuid,
  membership_id: uuid,
  access_version: z.number().int().min(1).max(2147483647),
  security_role: z.literal("KXRA_OWNER"),
  organisation_kind: z.literal("KXRA"),
  relationship_type: z.literal("INTERNAL"),
  account_state: z.literal("ACTIVE"),
  auth_time: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER / 1000),
  session_version: z.number().int().min(1).max(2147483647),
  provider_session_version: z.number().int().min(1).max(2147483647),
  provider_session_id: uuid,
});

export type CustomerDirectoryPorts = {
  /** Existing server actor() composition, not request/JWT role metadata. */
  identity(): Promise<CustomerDirectoryActor | null>;
  /**
   * Trusted backend seam: existing packages/db.query/scoped authenticated
   * transaction, never a browser connector, service-role or unscoped query.
   * Test doubles exercise adapter behavior, NOT PostgreSQL authorization.
   */
  query(
    actor: Principal,
    sql: string,
    values: unknown[],
  ): Promise<{ value: unknown }[]>;
};
type Environment = Record<string, string | undefined>;
type Failure =
  | "DISABLED"
  | "INVALID_INPUT"
  | "IDENTITY_REQUIRED"
  | "CURSOR_REJECTED"
  | "ACCESS_DENIED"
  | "UNAVAILABLE";
export class CustomerDirectoryError extends Error {
  constructor(readonly code: Failure) {
    super(`CUSTOMER_DIRECTORY_${code}`);
  }
}

/**
 * Required future signatures (not installed by this source):
 * customer_directory_authorized_v1(uuid,int,int) -> boolean;
 * customer_directory_page_v1(uuid,int,int,jsonb) -> jsonb.
 * Arguments 1..3 are expected membership ID/version and account session epoch.
 * Both RPCs must independently enforce current authority from database rows:
 * selected ACTIVE KXRA organisation, ACTIVE INTERNAL KXRA_OWNER membership
 * with current version/dates, ACTIVE verified SUPABASE account/current epoch,
 * legal gate, recent MFA, and genuinely current original Auth session binding.
 * A signed JWT or a true JS predicate is not authority. The reviewed guard must
 * acquire the authority/writer fence, recheck after waits, and hold through the
 * reader and COMMIT. The reader must do this itself for direct invocation too.
 * No direct runtime grant to private original-session helpers is implied.
 */
export const customerDirectorySql = `select case
  when kxra_owner_metadata.customer_directory_authorized_v1($1::uuid,$2::integer,$3::integer)
  then kxra_owner_metadata.customer_directory_page_v1($1::uuid,$2::integer,$3::integer,$4::jsonb)
  else null
end as value`;

function currentActor(raw: CustomerDirectoryActor | null, now: number) {
  const parsed = actorShape.safeParse(raw);
  if (!parsed.success) throw new CustomerDirectoryError("IDENTITY_REQUIRED");
  const actor = parsed.data;
  if (
    actor.org_id !== actor.organisation_id ||
    actor.provider_session_version !== actor.session_version ||
    actor.auth_time * 1000 < now - cursorLifetimeMs ||
    actor.auth_time * 1000 > now + 60_000
  )
    throw new CustomerDirectoryError("IDENTITY_REQUIRED");
  // Copy only known primitives before any further await. No inherited extras,
  // mutable actor references, contact fields or room execution grants propagate.
  return Object.freeze(actor);
}

function scopeFor(
  actor: z.infer<typeof actorShape>,
  input: z.infer<typeof customerDirectoryInputV1>,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        cursorPurpose,
        customerDirectoryVersion,
        actor.id,
        actor.organisation_id,
        actor.membership_id,
        actor.access_version,
        actor.provider_session_id,
        actor.session_version,
        actor.provider_session_version,
        input.organisation_state ?? null,
        input.page_size,
      ]),
    )
    .digest("hex");
}
function encodeBookmark(value: z.infer<typeof bookmark>) {
  return Buffer.from(
    JSON.stringify({
      version: value.version,
      purpose: value.purpose,
      after_organisation_id: value.after_organisation_id,
      scope: value.scope,
      issued_at: value.issued_at,
    }),
    "utf8",
  ).toString("base64url");
}
function readBookmark(token: string | undefined, scope: string, now: number) {
  if (!token) return null;
  try {
    const parsed = bookmark.parse(
      JSON.parse(Buffer.from(token, "base64url").toString("utf8")),
    );
    if (
      encodeBookmark(parsed) !== token ||
      parsed.scope !== scope ||
      parsed.issued_at > now ||
      parsed.issued_at + cursorLifetimeMs <= now
    )
      throw Error();
    return parsed;
  } catch {
    throw new CustomerDirectoryError("CURSOR_REJECTED");
  }
}

/**
 * Backend-only read used by the owner metadata page. Default off, no fallback
 * if the separately reviewed SQL surface is absent, denied, or malformed.
 * Bookmarks are UNSIGNED: scope/age checks catch accidental inconsistent reuse,
 * not tampering. Callers can construct a different valid bookmark. A bookmark
 * is never authority; every request performs fresh server and SQL checks.
 * UUID ordering is live, not a snapshot. Inserts before a bookmark and rows
 * entering a lifecycle filter behind it require refresh. Names/states can
 * change between pages. sampled_at is the DB page time, not a history promise.
 */
export async function readCustomerDirectory(
  rawInput: unknown,
  ports: CustomerDirectoryPorts,
  environment: Environment = process.env,
): Promise<CustomerDirectoryPage> {
  if (environment.KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED !== "true")
    throw new CustomerDirectoryError("DISABLED");
  const parsed = customerDirectoryInputV1.safeParse(rawInput);
  if (!parsed.success) throw new CustomerDirectoryError("INVALID_INPUT");
  const input = Object.freeze(parsed.data);
  let actor: ReturnType<typeof currentActor>;
  try {
    actor = currentActor(await ports.identity(), Date.now());
  } catch {
    throw new CustomerDirectoryError("IDENTITY_REQUIRED");
  }
  if (environment.KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED !== "true")
    throw new CustomerDirectoryError("DISABLED");
  const now = Date.now(),
    scope = scopeFor(actor, input);
  const after = readBookmark(input.cursor, scope, now);
  try {
    const rows = await ports.query(actor, customerDirectorySql, [
      actor.membership_id,
      actor.access_version,
      actor.session_version,
      JSON.stringify({
        version: customerDirectoryVersion,
        after_organisation_id: after?.after_organisation_id ?? null,
        organisation_state: input.organisation_state ?? null,
        limit: input.page_size + 1,
      }),
    ]);
    if (environment.KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED !== "true")
      throw new CustomerDirectoryError("DISABLED");
    if (!Array.isArray(rows) || rows.length !== 1) throw Error();
    if (rows[0]?.value === null)
      throw new CustomerDirectoryError("ACCESS_DENIED");
    const result = databasePage.parse(rows[0]?.value);
    if (
      result.items.length > input.page_size + 1 ||
      result.has_more !== (result.items.length === input.page_size + 1)
    )
      throw Error();
    let previous = after?.after_organisation_id;
    for (const item of result.items) {
      if (
        (previous !== undefined && item.organisation_id <= previous) ||
        item.organisation_id === actor.organisation_id ||
        (input.organisation_state !== undefined &&
          item.organisation_state !== input.organisation_state)
      )
        throw Error();
      previous = item.organisation_id;
    }
    const items = result.items
      .slice(0, input.page_size)
      .map(({ organisation_kind: _kind, ...item }) => item);
    return customerDirectoryPageV1.parse({
      version: customerDirectoryVersion,
      consistency: "LIVE",
      sampled_at: result.sampled_at,
      items,
      page_size: input.page_size,
      has_more: result.has_more,
      next_cursor: result.has_more
        ? encodeBookmark({
            version: customerDirectoryVersion,
            purpose: cursorPurpose,
            after_organisation_id: items[items.length - 1].organisation_id,
            scope,
            issued_at: after?.issued_at ?? now,
          })
        : null,
    });
  } catch (error) {
    if (
      error instanceof CustomerDirectoryError &&
      (error.code === "ACCESS_DENIED" || error.code === "DISABLED")
    )
      throw error;
    // No SQL detail, returned data, identifier or provider error is disclosed.
    throw new CustomerDirectoryError("UNAVAILABLE");
  }
}
