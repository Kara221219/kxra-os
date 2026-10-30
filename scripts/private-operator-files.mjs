import fs from "node:fs";
import path from "node:path";

// The workspace is trusted. Everything below the private runtime root must
// remain owned by this operator and inaccessible to other OS users. A hostile
// process running as the same OS user is outside this tooling boundary.
export function privateDirectory(directory) {
  const target = path.resolve(directory);
  let parent = path.dirname(target);
  for (;;) {
    const stat = fs.lstatSync(parent);
    // Root-owned sticky temporary directories preserve each child's custody.
    const stickyTemporaryParent = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      ![0, process.getuid()].includes(stat.uid) ||
      ((stat.mode & 0o022) !== 0 && !stickyTemporaryParent)
    )
      throw Error("PRIVATE_DIRECTORY_REQUIRED");
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  try {
    fs.mkdirSync(target, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const stat = fs.lstatSync(target);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0
  )
    throw Error("PRIVATE_DIRECTORY_REQUIRED");
  return target;
}

// Retain the descriptor across provider waits: later writes cannot follow a
// replaced leaf pathname. Exclusive creation also preserves uncertain ledgers.
export function openPrivateFile(filename, createOnly = false) {
  privateDirectory(path.dirname(filename));
  const flags =
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  let descriptor;
  let created = false;
  try {
    descriptor = fs.openSync(
      filename,
      flags | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    created = true;
  } catch (error) {
    if (error.code !== "EEXIST" || createOnly) throw error;
    descriptor = fs.openSync(filename, flags);
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0 ||
      stat.nlink !== 1
    )
      throw Error("PRIVATE_FILE_REQUIRED");
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
  return {
    created,
    read() {
      const size = fs.fstatSync(descriptor).size;
      if (size > 1_000_000) throw Error("PRIVATE_RECORD_TOO_LARGE");
      const buffer = Buffer.alloc(size);
      const bytes = fs.readSync(descriptor, buffer, 0, size, 0);
      return buffer.subarray(0, bytes).toString("utf8");
    },
    write(value) {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      let offset = 0;
      while (offset < bytes.length)
        offset += fs.writeSync(
          descriptor,
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
      fs.ftruncateSync(descriptor, bytes.length);
      fs.fsyncSync(descriptor);
    },
    close() {
      fs.closeSync(descriptor);
    },
  };
}

export function writePrivateOutput(filename, bytes) {
  const file = openPrivateFile(filename, true);
  try {
    file.write(bytes);
  } finally {
    file.close();
  }
}
