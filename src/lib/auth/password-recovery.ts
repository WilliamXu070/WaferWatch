export const PASSWORD_RECOVERY_COOKIE = "waferwatch-password-recovery";
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 10 * 60;

export function safeAuthRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  // Backslashes and control characters are normalized by URL parsers and can
  // turn an apparently relative path into an external redirect.
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\x00-\x20\x7f]/.test(value)
    ? value
    : fallback;
}
