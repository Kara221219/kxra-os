import path from "node:path";

export const testOrigin = process.env.KXRA_ORIGIN || "http://127.0.0.1:3210";

export function runtimeFile(name: string) {
  return path.join(
    process.env.KXRA_RUNTIME || path.join(process.cwd(), ".runtime"),
    name,
  );
}
