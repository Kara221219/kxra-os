import crypto from "node:crypto";

export const telemetryEvents = [
  "public_enquiry.accepted",
  "public_enquiry.rejected",
  "http.request.completed",
  "worker.run.completed",
] as const;

export type TelemetryEvent = (typeof telemetryEvents)[number];
type MetadataValue = string | number | boolean;

const allowedMetadata = new Set([
  "request_id",
  "route_id",
  "operation",
  "outcome",
  "status_code",
  "duration_bucket",
  "provider",
  "environment",
  "release",
]);
const forbiddenKey =
  /(email|phone|name|address|message|prompt|content|token|secret|password|cookie|authorization|file|identity|user|member|partner|project)/i;
const forbiddenValue =
  /(bearer\s+|sk[-_][a-z0-9]|eyJ[a-zA-Z0-9_-]{8,}\.|-----BEGIN|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;

export type TelemetryEnvelope = Readonly<{
  schema: "KXRA_TELEMETRY_V1";
  event: TelemetryEvent;
  occurred_at: string;
  event_id: string;
  metadata: Readonly<Record<string, MetadataValue>>;
}>;

function cleanValue(key: string, value: unknown): MetadataValue {
  if (!allowedMetadata.has(key) || forbiddenKey.test(key))
    throw Error("TELEMETRY_FIELD_NOT_ALLOWED");
  if (!["string", "number", "boolean"].includes(typeof value))
    throw Error("TELEMETRY_VALUE_NOT_SCALAR");
  if (typeof value === "string") {
    if (
      value.length > 120 ||
      forbiddenValue.test(value) ||
      /[\r\n]/.test(value)
    )
      throw Error("TELEMETRY_VALUE_REJECTED");
    if (key === "request_id" && !/^[0-9a-f-]{36}$/i.test(value))
      throw Error("TELEMETRY_REQUEST_ID_INVALID");
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("TELEMETRY_VALUE_REJECTED");
  return value as MetadataValue;
}

export function telemetryEnvelope(
  event: TelemetryEvent,
  metadata: Record<string, unknown>,
  now = new Date(),
): TelemetryEnvelope {
  if (!telemetryEvents.includes(event))
    throw Error("TELEMETRY_EVENT_NOT_ALLOWED");
  const clean: Record<string, MetadataValue> = {};
  for (const [key, value] of Object.entries(metadata))
    clean[key] = cleanValue(key, value);
  return Object.freeze({
    schema: "KXRA_TELEMETRY_V1",
    event,
    occurred_at: now.toISOString(),
    event_id: crypto.randomUUID(),
    metadata: Object.freeze(clean),
  });
}

export interface TelemetrySink {
  capture(envelope: TelemetryEnvelope): Promise<void>;
}

export class DisabledTelemetrySink implements TelemetrySink {
  async capture(_envelope: TelemetryEnvelope) {}
}

export async function captureTelemetry(
  sink: TelemetrySink,
  event: TelemetryEvent,
  metadata: Record<string, unknown>,
) {
  const envelope = telemetryEnvelope(event, metadata);
  await sink.capture(envelope);
  return envelope.event_id;
}
