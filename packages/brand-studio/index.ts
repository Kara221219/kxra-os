import crypto from "node:crypto";
import net from "node:net";
import { z } from "zod";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const boundedList = (maximumItems: number, maximumText: number) =>
  z.array(boundedText(maximumText)).max(maximumItems);

export const brandChannels = [
  "LINKEDIN",
  "INSTAGRAM",
  "FACEBOOK",
  "EMAIL",
  "WEB",
  "YOUTUBE",
] as const;
export const brandChannelSchema = z.enum(brandChannels);

export const brandProfileSchema = z
  .object({
    business_name: boundedText(160),
    summary: boundedText(5000),
    tone: boundedList(12, 120).min(1),
    audiences: boundedList(20, 500).min(1),
    offers: boundedList(20, 500).min(1),
    prohibited_claims: boundedList(30, 500),
    required_disclaimers: boundedList(30, 1000),
    palette: z.array(z.string().regex(/^#[A-Fa-f0-9]{6}$/)).max(12),
    typography: boundedList(12, 200),
  })
  .strict();

export type BrandProfile = z.infer<typeof brandProfileSchema>;

export const campaignClaimSchema = z
  .object({
    text: boundedText(1000),
    evidence_note: boundedText(2000),
  })
  .strict();

export const campaignBriefSchema = z
  .object({
    objective: boundedText(2000),
    audience: boundedText(2000),
    offer: boundedText(2000),
    channels: z.array(brandChannelSchema).min(1).max(6),
    constraints: z.string().max(5000),
    claims: z.array(campaignClaimSchema).max(20),
    success_measure: boundedText(2000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.channels).size !== value.channels.length)
      context.addIssue({
        code: "custom",
        path: ["channels"],
        message: "Channels must be unique",
      });
  });

export const creativeContentSchema = z
  .object({
    headline: boundedText(240),
    body: boundedText(10000),
    call_to_action: boundedText(240),
    alt_text: boundedText(1000),
    warnings: boundedList(20, 1000),
  })
  .strict();

export type CreativeContent = z.infer<typeof creativeContentSchema>;

export const generatedVariantSchema = z
  .object({
    channel: brandChannelSchema,
    content: creativeContentSchema,
  })
  .strict();

export const generatedVariantsSchema = z
  .array(generatedVariantSchema)
  .min(1)
  .max(6);

function clip(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

function list(value: string | undefined, fallback: string) {
  const values = (value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : [fallback];
}

export function assertPublicWebsiteUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw Error("BRAND_SOURCE_URL_INVALID");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    parsed.protocol !== "https:" ||
    (parsed.port && parsed.port !== "443") ||
    parsed.username ||
    parsed.password ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost") ||
    net.isIP(hostname) !== 0
  )
    throw Error("BRAND_SOURCE_URL_NOT_PUBLIC_HTTPS");
  return parsed.toString();
}

export function inferLocalBrandProfile(input: {
  websiteUrl?: string | null;
  sourceText: string;
  businessName?: string | null;
  tone?: string;
  audiences?: string;
  offers?: string;
}) {
  const sourceText = input.sourceText.replace(/\s+/g, " ").trim();
  if (!sourceText || sourceText.length > 50_000)
    throw Error("BRAND_SOURCE_CONTENT_INVALID");
  let hostname = "";
  if (input.websiteUrl)
    hostname = new URL(assertPublicWebsiteUrl(input.websiteUrl)).hostname;
  const inferredName =
    input.businessName?.trim() ||
    hostname
      .replace(/^www\./, "")
      .split(".")[0]
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ") ||
    "Customer confirmation required";
  const profile = brandProfileSchema.parse({
    business_name: clip(inferredName, 160),
    summary: clip(sourceText, 1200),
    tone: list(input.tone, "Customer confirmation required"),
    audiences: list(input.audiences, "Customer confirmation required"),
    offers: list(input.offers, "Customer confirmation required"),
    prohibited_claims: [],
    required_disclaimers: [],
    palette: [],
    typography: [],
  });
  return profile;
}

export function brandProfileEvidence(
  sourceVersionId: string,
  classification: "AI INFERENCE" | "USER-SUPPLIED INFORMATION" = "AI INFERENCE",
) {
  const note =
    classification === "AI INFERENCE"
      ? "Customer-editable draft inferred from the supplied source snapshot."
      : "Customer-corrected field linked to the supplied source snapshot.";
  return [
    {
      source_version_id: sourceVersionId,
      field_path: "business_name",
      classification,
      evidence_note: note,
    },
    {
      source_version_id: sourceVersionId,
      field_path: "summary",
      classification,
      evidence_note: note,
    },
    ...["tone", "audiences", "offers"].map((field) => ({
      source_version_id: sourceVersionId,
      field_path: field,
      classification,
      evidence_note: note,
    })),
  ];
}

const channelStyle: Record<(typeof brandChannels)[number], string> = {
  LINKEDIN: "A concise professional update",
  INSTAGRAM: "A short visual-first caption",
  FACEBOOK: "A conversational community update",
  EMAIL: "A direct email introduction",
  WEB: "A clear website campaign block",
  YOUTUBE: "A concise video description draft",
};

export function generateLocalBrandVariants(input: {
  requestId: string;
  inputSha256: string;
  profile: unknown;
  campaign: unknown;
  channels: unknown;
  variantCount: number;
}) {
  const profile = brandProfileSchema.parse(input.profile);
  const campaign = campaignBriefSchema.parse(input.campaign);
  const channels = z
    .array(brandChannelSchema)
    .min(1)
    .max(6)
    .parse(input.channels);
  if (
    !Number.isInteger(input.variantCount) ||
    input.variantCount < 1 ||
    input.variantCount > 6 ||
    new Set(channels).size !== channels.length ||
    channels.some((channel) => !campaign.channels.includes(channel))
  )
    throw Error("BRAND_GENERATION_INPUT_INVALID");

  const warnings = [
    "Customer review is required before export.",
    "No publication or scheduling is authorized.",
  ];
  if (campaign.claims.length)
    warnings.push("Campaign claims require evidence and compliance review.");
  if (profile.required_disclaimers.length)
    warnings.push("Apply every required disclaimer before use.");
  if (profile.prohibited_claims.length)
    warnings.push(
      "Check the profile's prohibited-claims list before approval.",
    );

  const variants = Array.from({ length: input.variantCount }, (_, index) => {
    const channel = channels[index % channels.length];
    const variation = index >= channels.length ? ` Version ${index + 1}.` : "";
    const content = creativeContentSchema.parse({
      headline: clip(`${profile.business_name}: ${campaign.objective}`, 240),
      body: clip(
        `${channelStyle[channel]} for ${campaign.audience}. ${profile.business_name} presents ${campaign.offer}. ${profile.summary}${variation}`,
        10_000,
      ),
      call_to_action: "Review the offer and choose the next step",
      alt_text: clip(
        `Text creative for ${profile.business_name}, prepared for ${channel.toLowerCase()}.`,
        1000,
      ),
      warnings,
    });
    return { channel, content };
  });
  return generatedVariantsSchema.parse(variants);
}

export function hashBrandValue(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function renderBrandExport(
  format: "TEXT" | "MARKDOWN" | "JSON",
  content: CreativeContent,
) {
  const parsed = creativeContentSchema.parse(content);
  if (format === "JSON") return JSON.stringify(parsed, null, 2) + "\n";
  if (format === "MARKDOWN")
    return [
      `# ${parsed.headline}`,
      "",
      parsed.body,
      "",
      `**Call to action:** ${parsed.call_to_action}`,
      "",
      `**Alt text:** ${parsed.alt_text}`,
      "",
      "## Review notes",
      ...parsed.warnings.map((warning) => `- ${warning}`),
      "",
    ].join("\n");
  return [
    parsed.headline,
    "",
    parsed.body,
    "",
    `Call to action: ${parsed.call_to_action}`,
    `Alt text: ${parsed.alt_text}`,
    "",
    "Review notes:",
    ...parsed.warnings.map((warning) => `- ${warning}`),
    "",
  ].join("\n");
}
