/** Bounded shutdown of a ChildProcess created by this caller. Never discovers or kills other PIDs.
 * @param {import('node:child_process').ChildProcess | undefined} child
 * @param {{termMs?:number,killMs?:number,onUncertain?:()=>void}} options
 */
export async function stopOwnedFixtureChild(child, options = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null)
    return true;
  const { termMs = 3000, killMs = 1000, onUncertain = () => {} } = options;
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const exit = () => resolveExit(true);
  const error = () => {}; // A failed signal is not proof of exit; the bounded wait decides.
  child.once("exit", exit);
  child.on("error", error);
  async function observed(ms) {
    let timer;
    try {
      return await Promise.race([
        exited,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  function signal(value) {
    try {
      child.kill(value);
    } catch {
      /* Wait for explicit exit or fail closed. */
    }
  }
  try {
    signal("SIGTERM");
    if (await observed(termMs)) return true;
    signal("SIGKILL");
    if (await observed(killMs)) return true;
    onUncertain();
    return false;
  } finally {
    child.off("exit", exit);
    child.off("error", error);
  }
}
