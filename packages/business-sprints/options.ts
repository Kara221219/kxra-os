import { sprintOptions } from "../../apps/marketing/lib/business-sprint-options";
export { sprintOptions } from "../../apps/marketing/lib/business-sprint-options";

export function sprintConstraints(key: string, context: string) {
  const selected = sprintOptions.find((item) => item.key === key);
  if (!selected) throw Error("SPRINT_PACKAGE_INVALID");
  return `Requested package: ${selected.name}\n${context.trim()}`;
}
