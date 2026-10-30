// Test-harness configuration only. Never disable the browser's native sandbox.
export function recoveryBrowserLaunchOptions(platform, githubActions, env) {
  return {
    host: "127.0.0.1",
    headless: true,
    chromiumSandbox: true,
    // Ubuntu's installed Chrome has an OS-managed AppArmor profile; downloaded
    // developer Chromium builds may be denied user namespaces on Ubuntu 24.04.
    // This is one supported channel choice, never an automatic retry/fallback.
    ...(platform === "linux" && githubActions === "true"
      ? { channel: "chrome" }
      : {}),
    env,
    timeout: 30000,
  };
}

export function recoveryBrowserFailureCategory(error) {
  // Error objects are transient. Return only fixed categories; no excerpts,
  // executable paths, commands, URLs or arbitrary provider/browser text.
  const text = typeof error?.message === "string" ? error.message : "";
  const bounded = text.slice(0, 32768);
  if (
    /No usable sandbox|Failed to move to new namespace|userns_create|apparmor.*DENIED/i.test(
      bounded,
    )
  )
    return "NATIVE_SANDBOX_UNAVAILABLE";
  if (
    /Executable doesn't exist|Chromium distribution 'chrome' is not found/i.test(
      bounded,
    )
  )
    return "BROWSER_BINARY_UNAVAILABLE";
  if (error?.name === "TimeoutError") return "BROWSER_OPERATION_TIMEOUT";
  if (/WebSocket.*(?:closed|error)|ECONNREFUSED/i.test(bounded))
    return "BROWSER_CONNECTION_FAILED";
  return "BROWSER_FAILURE_UNCLASSIFIED";
}
