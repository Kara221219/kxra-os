import fs from "node:fs";
import crypto from "node:crypto";
/** Never remove an existing/stale/foreign lease. Release only our own exact token. */
export function acquireNativeFixtureLease(
  owner,
  file = "/tmp/kxra-native-serial.lock",
) {
  const token = crypto.randomUUID();
  let fd;
  try {
    fd = fs.openSync(file, "wx", 0o600);
  } catch (e) {
    if (e.code === "EEXIST")
      throw Error(
        "Shared native fixture lease is held; wait for its owner to release it",
      );
    throw e;
  }
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({
        owner,
        pid: process.pid,
        token,
        created_at: new Date().toISOString(),
      }),
    );
  } finally {
    fs.closeSync(fd);
  }
  return () => {
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    if (stored.token !== token)
      throw Error("Native fixture lease ownership changed; refusing cleanup");
    fs.unlinkSync(file);
  };
}
