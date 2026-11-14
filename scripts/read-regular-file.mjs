// Descriptor read for a canonical regular file. Do not stat a path and then read it.
import fs from "node:fs";
import path from "node:path";

export function readCanonicalRegularFileSync(file) {
  const parent = path.dirname(file);
  if (
    fs.realpathSync(parent) !== parent ||
    path.join(parent, path.basename(file)) !== file
  ) {
    const rejected = Error("SYMLINK_REJECTED");
    rejected.code = "ELOOP";
    throw rejected;
  }
  let descriptor;
  try {
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error?.code === "ELOOP") {
      const rejected = Error("SYMLINK_REJECTED");
      rejected.code = "ELOOP";
      throw rejected;
    }
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      const rejected = Error("REGULAR_FILE_REQUIRED");
      rejected.code = "EISDIR";
      throw rejected;
    }
    return { stat, bytes: fs.readFileSync(descriptor) };
  } finally {
    fs.closeSync(descriptor);
  }
}
