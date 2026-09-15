import { confirmationErrorPath } from "./confirmation";
import { safeAuthRedirectPath } from "./password-recovery";

export function readEmailFragment(hash: string, next: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error_code") ?? params.get("error");
  if (error) return { errorPath: confirmationErrorPath(error) };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return { errorPath: confirmationErrorPath("confirmation_missing") };
  const type = params.get("type");
  return {
    session: {
      accessToken,
      refreshToken,
      type,
      next: type === "recovery" ? "/reset-password" : safeAuthRedirectPath(next)
    }
  };
}
