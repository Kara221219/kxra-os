import fs from "node:fs";
import path from "node:path";

export function readPublicationFile(root, file) {
  const rootStat = fs.lstatSync(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.uid !== process.getuid() ||
    rootStat.mode & 0o022
  )
    throw Error("PUBLICATION_WORKSPACE_CUSTODY_REQUIRED");
  const target = path.resolve(root, file);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("PUBLICATION_PATH_REJECTED");
  let parent = root;
  for (const component of relative.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, component);
    let stat;
    try {
      stat = fs.lstatSync(parent);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("PUBLICATION_SYMLINK_REJECTED");
    if (stat.uid !== process.getuid() || stat.mode & 0o022)
      throw Error("PUBLICATION_WORKSPACE_CUSTODY_REQUIRED");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(
      target,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
  } catch (error) {
    if (error.code === "ENOENT") return null; // Tracked deletion.
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw Error("PUBLICATION_REGULAR_FILE_REQUIRED");
    if (stat.uid !== process.getuid() || stat.mode & 0o022)
      throw Error("PUBLICATION_WORKSPACE_CUSTODY_REQUIRED");
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}
