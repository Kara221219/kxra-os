/** Only exact server responses known to precede SQL may release an uncertain
 * client request. Unknown responses and all post-dispatch failures stay held. */
export function pairedSetupPrewriteRejection(status: number, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("error" in value) ||
    typeof value.error !== "string"
  )
    return null;
  const statuses: Record<string, number> = {
    PAIRED_SETUP_DISABLED: 503,
    METHOD_NOT_ALLOWED: 405,
    ORIGIN_REJECTED: 403,
    JSON_REQUIRED: 415,
    INVALID_COMMAND: 400,
    BODY_TOO_LARGE: 413,
    REQUEST_TIMEOUT: 408,
    REQUEST_ABORTED: 400,
    IDENTITY_REQUIRED: 401,
  };
  return Object.hasOwn(statuses, value.error) &&
    statuses[value.error] === status
    ? value.error
    : null;
}
export class PairedSetupPrewriteError extends Error {
  constructor(readonly code: string) {
    super("PAIRED_SETUP_NOT_SUBMITTED");
  }
}
