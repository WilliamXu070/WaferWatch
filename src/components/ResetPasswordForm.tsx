"use client";

import { useActionState } from "react";
import { updatePasswordFormAction, type AuthFormState } from "@/features/accounts/actions";
import { authFormStyles } from "@/styles/tw";

const initialState: AuthFormState = {
  message: null,
  error: null
};

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordFormAction, initialState);

  return (
    <form action={action} className={authFormStyles.resetForm}>
      <label className={authFormStyles.field}>
        <span className={authFormStyles.label}>New password</span>
        <input
          className={authFormStyles.input}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
      </label>
      <label className={authFormStyles.field}>
        <span className={authFormStyles.label}>Confirm new password</span>
        <input
          className={authFormStyles.input}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {state.error ? <p className={authFormStyles.formError}>{state.error}</p> : null}
      <button className={authFormStyles.submit} type="submit">Update password</button>
    </form>
  );
}
