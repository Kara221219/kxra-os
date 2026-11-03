import type { CustomAppSchema } from "./contract";
export type AppValues = Record<string, string | boolean>;
export type AppRecord = {
  id: string;
  schema_version: number;
  version: number;
  data: AppValues;
  schema: CustomAppSchema;
};
export type AppRecordReceipt = {
  record_id: string;
  version: number;
  schema_version: number;
  operation_id: string;
};
export type AppRecordPage = {
  app: { id: string; revision: number; active_version: number | null };
  active_schema: CustomAppSchema | null;
  can_write: boolean;
  records: AppRecord[];
  next_cursor: string | null;
};
export function emptyAppValues(schema: CustomAppSchema): AppValues {
  return Object.fromEntries(
    schema.fields.map((f) => [f.key, f.type === "checkbox" ? false : ""]),
  );
}
export function validAppValues(
  schema: CustomAppSchema,
  input: unknown,
): input is AppValues {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return false;
  const s = schema,
    d = input as Record<string, unknown>;
  if (Object.keys(d).length !== s.fields.length) return false;
  return s.fields.every((f) => {
    if (!Object.hasOwn(d, f.key)) return false;
    const v = d[f.key];
    if (f.type === "checkbox")
      return typeof v === "boolean" && (!f.required || v);
    return (
      typeof v === "string" &&
      v.length <= (f.type === "textarea" ? 4000 : 1000) &&
      (!f.required || v.trim().length > 0) &&
      (f.type !== "select" || v === "" || f.options.includes(v))
    );
  });
}
