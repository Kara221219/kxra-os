// Deliberately small shared validator: this contract is also used in the browser.
// No expressions, source, URLs, capability bindings or arbitrary object properties.
type FieldBase = { key: string; label: string; required: boolean };
export type CustomAppSchema = {
  format: "kxra.form.v1";
  title: string;
  description: string;
  fields: (FieldBase &
    (
      | { type: "text" | "textarea" | "checkbox" }
      | { type: "select"; options: string[] }
    ))[];
};
function object(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  return (
    Object.keys(v).length === allowed.length &&
    allowed.every((k) => Object.hasOwn(v, k))
  );
}
function label(v: unknown): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= 120;
}
function valid(input: unknown): input is CustomAppSchema {
  if (
    !object(input) ||
    !keys(input, ["format", "title", "description", "fields"]) ||
    input.format !== "kxra.form.v1" ||
    !label(input.title) ||
    typeof input.description !== "string" ||
    input.description.length > 1000 ||
    !Array.isArray(input.fields) ||
    input.fields.length < 1 ||
    input.fields.length > 20
  )
    return false;
  const seen = new Set<string>();
  for (const f of input.fields) {
    if (
      !object(f) ||
      typeof f.key !== "string" ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) ||
      ["constructor", "prototype", "__proto__"].includes(f.key) ||
      seen.has(f.key) ||
      !label(f.label) ||
      typeof f.required !== "boolean"
    )
      return false;
    seen.add(f.key);
    if (f.type === "select") {
      if (
        !keys(f, ["key", "label", "required", "type", "options"]) ||
        !Array.isArray(f.options) ||
        f.options.length < 1 ||
        f.options.length > 20 ||
        !Array.from(f.options).every(label) ||
        new Set(f.options).size !== f.options.length
      )
        return false;
    } else if (
      typeof f.type !== "string" ||
      !["text", "textarea", "checkbox"].includes(f.type) ||
      !keys(f, ["key", "label", "required", "type"])
    )
      return false;
  }
  return true;
}
export const customAppSchema = {
  safeParse(
    input: unknown,
  ): { success: true; data: CustomAppSchema } | { success: false } {
    return valid(input) ? { success: true, data: input } : { success: false };
  },
  parse(input: unknown): CustomAppSchema {
    if (!valid(input)) throw Error("Invalid form schema");
    return input;
  },
};
export type CustomApp = {
  id: string;
  revision: number;
  latest_version: number;
  active_version: number | null;
  title: string;
};
export type CustomAppVersion = {
  version: number;
  artifact: { runtime: "kxra.form.v1"; schema: CustomAppSchema };
  sha256: string;
  previously_released: boolean;
};
export const exampleCustomApp: CustomAppSchema = {
  format: "kxra.form.v1",
  title: "Synthetic project intake",
  description: "Local preview only. Entries are discarded.",
  fields: [
    { key: "brief", type: "textarea", label: "Project brief", required: true },
    {
      key: "priority",
      type: "select",
      label: "Priority",
      required: true,
      options: ["Normal", "High"],
    },
    {
      key: "reviewed",
      type: "checkbox",
      label: "Ready for review",
      required: false,
    },
  ],
};
