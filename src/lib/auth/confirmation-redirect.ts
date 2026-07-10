import "server-only";
import { safeAuthRedirectPath } from "./password-recovery";

type ConfirmationSearchParams = {
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  message?: string;
  next?: string;
  token_hash?: string;
  type?: string;
};

export function confirmationRedirectPath(params: ConfirmationSearchParams) {
  const hasConfirmationParams = Boolean(params.code) || Boolean(params.token_hash);

  if (!hasConfirmationParams) {
    return null;
  }

  const query = new URLSearchParams();

  for (const key of ["code", "token_hash", "type", "error", "error_code", "error_description"] as const) {
    const value = params[key];
    if (value) {
      query.set(key, value);
    }
  }

  query.set("next", safeAuthRedirectPath(params.next));

  return `/auth/confirm?${query.toString()}`;
}
