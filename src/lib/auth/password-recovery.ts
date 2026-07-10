export const PASSWORD_RECOVERY_COOKIE = "waferwatch-password-recovery";
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 10 * 60;

export function safeAuthRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
