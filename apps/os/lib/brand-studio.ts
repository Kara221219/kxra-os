import type { Actor } from "./auth";
import { query, localMode } from "../../../packages/db";
import {
  campaignBriefSchema,
  generateLocalBrandVariants,
} from "../../../packages/brand-studio";

export type EntitlementDecision = {
  allowed: boolean;
  reason: string;
  source_type: string | null;
  source_id: string | null;
  quantity_limit: string | null;
  consumed_units: string;
  reserved_units: string;
  window_start: string | null;
  window_end: string | null;
  policy_version: number | null;
};

export type BrandStudioSnapshot = {
  generation_available: boolean;
  entitlements: {
    access: EntitlementDecision;
    generate: EntitlementDecision;
    export: EntitlementDecision;
  };
  sources: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  campaigns: Record<string, unknown>[];
  variants: Record<string, unknown>[];
  exports: Record<string, unknown>[];
};

async function entitlement(actor: Actor, feature: string) {
  return (
    await query<EntitlementDecision>(
      actor,
      "select * from kxra.entitlement_decision($1,1)",
      [feature],
    )
  )[0];
}

export async function loadBrandStudio(
  actor: Actor,
): Promise<BrandStudioSnapshot> {
  const [access, generate, exportDecision] = await Promise.all([
    entitlement(actor, "brand-studio.access"),
    entitlement(actor, "brand.generate"),
    entitlement(actor, "brand.export"),
  ]);
  if (!access.allowed)
    return {
      generation_available: false,
      entitlements: { access, generate, export: exportDecision },
      sources: [],
      profiles: [],
      campaigns: [],
      variants: [],
      exports: [],
    };
  const [sources, profiles, campaigns, variants, exports] = await Promise.all([
    query(
      actor,
      `select source.id,source.project_id,project.code as project_code,
        source.source_type,source.locator,source.rights_basis,source.state,
        source.current_version,version.id as source_version_id,
        version.content_sha256,version.fetch_state,version.security_result,
        version.source_classification,source.created_at
       from kxra.brand_sources source
       join kxra.projects project on project.id=source.project_id
       join kxra.brand_source_versions version
        on version.source_id=source.id and version.version=source.current_version
       order by source.created_at desc,source.id desc`,
    ),
    query(
      actor,
      `select profile.id,profile.project_id,project.code as project_code,profile.name,
        profile.current_version,profile.approved_version,profile.state,
        version.id as current_version_id,version.profile_data,version.profile_sha256,
        version.status as current_status,version.classification,version.created_at,
        coalesce((select count(*) from kxra.brand_profile_evidence evidence
          where evidence.profile_version_id=version.id),0)::integer as evidence_count
       from kxra.brand_profiles profile
       join kxra.projects project on project.id=profile.project_id
       join kxra.brand_profile_versions version
        on version.profile_id=profile.id and version.version=profile.current_version
       order by profile.updated_at desc,profile.id desc`,
    ),
    query(
      actor,
      `select brief.id,brief.project_id,project.code as project_code,brief.profile_id,
        brief.name,brief.current_version,brief.approved_version,brief.state,
        version.id as current_version_id,version.objective,version.audience,
        version.offer,version.channels,version.constraints,version.claims,
        version.success_measure,version.brief_sha256,version.status as current_status,
        version.created_at
       from kxra.campaign_briefs brief
       join kxra.projects project on project.id=brief.project_id
       join kxra.campaign_brief_versions version
        on version.brief_id=brief.id and version.version=brief.current_version
       order by brief.updated_at desc,brief.id desc`,
    ),
    query(
      actor,
      `select variant.id,variant.project_id,project.code as project_code,
        variant.request_id,variant.channel,variant.content,variant.content_sha256,
        variant.parent_variant_id,variant.state,variant.adapter,variant.adapter_version,
        variant.created_at,review.id as latest_review_id,review.decision as latest_decision,
        review.checks as latest_checks,review.note as latest_review_note,
        export.id as export_id,export.export_format,export.state as export_state
       from kxra.creative_variants variant
       join kxra.projects project on project.id=variant.project_id
       left join lateral(
        select item.* from kxra.creative_reviews item
        where item.variant_id=variant.id order by item.created_at desc,item.id desc limit 1
       ) review on true
       left join lateral(
        select item.* from kxra.brand_exports item
        where item.variant_id=variant.id order by item.created_at desc,item.id desc limit 1
       ) export on true
       where variant.state<>'SUPERSEDED'
       order by variant.created_at desc,variant.id desc`,
    ),
    query(
      actor,
      `select export.id,export.project_id,project.code as project_code,
        export.variant_id,export.export_format,export.content_sha256,export.state,
        export.created_at,export.delivered_at
       from kxra.brand_exports export join kxra.projects project on project.id=export.project_id
       order by export.created_at desc,export.id desc`,
    ),
  ]);
  return {
    generation_available: localMode(),
    entitlements: { access, generate, export: exportDecision },
    sources,
    profiles,
    campaigns,
    variants,
    exports,
  };
}

type BegunGeneration = {
  generation_request_id: string;
  request_state: "RUNNING" | "SUCCEEDED" | "FAILED" | "WITHHELD";
  input_sha256: string;
  profile_data: unknown;
  objective: string;
  audience: string;
  offer: string;
  channels: string[];
  constraints: string;
  claims: unknown;
  success_measure: string;
  adapter_version: string;
};

export async function executeLocalBrandGeneration(
  actor: Actor,
  input: {
    projectId: string;
    profileId: string;
    profileVersion: number;
    briefId: string;
    briefVersion: number;
    channels: string[];
    variantCount: number;
    requestId: string;
  },
) {
  if (!localMode()) throw Error("BRAND_GENERATION_PROVIDER_UNAVAILABLE");
  let begun: BegunGeneration | undefined;
  try {
    begun = (
      await query<BegunGeneration>(
        actor,
        "select * from kxra.begin_brand_generation($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          input.projectId,
          input.profileId,
          input.profileVersion,
          input.briefId,
          input.briefVersion,
          input.channels,
          input.variantCount,
          input.requestId,
        ],
      )
    )[0];
    if (begun.request_state === "SUCCEEDED") {
      const variants = await query(
        actor,
        `select id,channel,content,content_sha256,state
         from kxra.creative_variants where request_id=$1
         order by generation_ordinal,id`,
        [begun.generation_request_id],
      );
      return {
        request_id: begun.generation_request_id,
        state: "SUCCEEDED",
        variants,
      };
    }
    if (begun.request_state !== "RUNNING")
      throw Error(`BRAND_GENERATION_${begun.request_state}`);
    const campaign = campaignBriefSchema.parse({
      objective: begun.objective,
      audience: begun.audience,
      offer: begun.offer,
      channels: begun.channels,
      constraints: begun.constraints,
      claims: begun.claims,
      success_measure: begun.success_measure,
    });
    const generated = generateLocalBrandVariants({
      requestId: begun.generation_request_id,
      inputSha256: begun.input_sha256,
      profile: begun.profile_data,
      campaign,
      channels: input.channels,
      variantCount: input.variantCount,
    });
    const completed = (
      await query<{ result_state: string; variant_ids: string[] }>(
        actor,
        "select * from kxra.complete_brand_generation($1,$2,$3)",
        [
          begun.generation_request_id,
          begun.input_sha256,
          JSON.stringify(generated),
        ],
      )
    )[0];
    const variants = await query(
      actor,
      `select id,channel,content,content_sha256,state
       from kxra.creative_variants where id=any($1::uuid[])
       order by generation_ordinal,id`,
      [completed.variant_ids],
    );
    return {
      request_id: begun.generation_request_id,
      state: completed.result_state,
      variants,
    };
  } catch (error) {
    if (begun?.request_state === "RUNNING")
      await query(actor, "select kxra.fail_brand_generation($1,$2)", [
        begun.generation_request_id,
        "LOCAL_ADAPTER_FAILURE",
      ]).catch(() => undefined);
    throw error;
  }
}
