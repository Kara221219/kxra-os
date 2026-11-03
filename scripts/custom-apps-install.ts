/** Synthetic local extension only; never reads DATABASE_URL or remote credentials. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
export async function installCustomApps() {
  if (!localModeConfiguration(process.env) || process.env.VERCEL_ENV)
    throw Error("Guarded synthetic fixture required");
  const root = fs.realpathSync(path.resolve(__dirname, ".."));
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  if (
    runtime !== path.join(root, ".runtime") &&
    !runtime.startsWith(path.join(root, ".runtime") + path.sep)
  )
    throw Error("Runtime must belong to this checkout");
  const socket = path.join(runtime, "socket");
  if (
    fs.lstatSync(socket).isSymbolicLink() ||
    fs.realpathSync(socket) !== socket
  )
    throw Error("Disposable socket directory required");
  const config = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  // Only the socket created by this checkout's disposable fixture harness is allowed.
  if (
    config.host !== path.join(runtime, "socket") ||
    config.user !== "kxra_app" ||
    config.database !== "postgres" ||
    config.connectionString ||
    config.ssl ||
    config.password ||
    !Number.isInteger(config.port)
  )
    throw Error("Disposable local database required");
  const db = new pg.Client({
    host: config.host,
    port: config.port,
    database: "postgres",
    user: os.userInfo().username,
  });
  await db.connect();
  try {
    const directory = (await db.query("show data_directory")).rows[0]
      .data_directory;
    if (fs.realpathSync(directory) !== path.join(runtime, "postgres"))
      throw Error("Disposable database directory mismatch");
    if (
      (await db.query("select to_regclass('kxra.custom_apps') present")).rows[0]
        .present
    )
      return;
    await db.query(
      fs.readFileSync(
        path.join(root, "packages/custom-apps/local-schema.sql"),
        "utf8",
      ),
    );
  } finally {
    await db.end();
  }
}
if (process.argv[1]?.endsWith("/scripts/custom-apps-install.ts")) {
  installCustomApps().catch(() => {
    console.error("Local custom-app installation failed");
    process.exitCode = 1;
  });
}
