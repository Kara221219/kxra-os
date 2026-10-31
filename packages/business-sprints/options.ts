// Canonical package choices shared by the compact client and full catalogue.
export const sprintOptions = [
  { key: "decision-review", name: "Decision Review" },
  { key: "improvement-sprint", name: "Business Improvement Sprint" },
  { key: "implementation", name: "Implementation Project" },
] as const;

export function sprintConstraints(key: string, context: string) {
  const selected = sprintOptions.find((item) => item.key === key);
  if (!selected) throw Error("SPRINT_PACKAGE_INVALID");
  return `Requested package: ${selected.name}\n${context.trim()}`;
}
