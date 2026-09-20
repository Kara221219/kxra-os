import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const application = path.join(root, "apps", "os");
fs.rmSync(path.join(application, ".next"), { recursive: true, force: true });
execFileSync(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
  { cwd: application, env: process.env, stdio: "inherit" },
);
