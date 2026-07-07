"use client";

import { useActionState } from "react";
import {
  signInFormAction,
  type AuthFormState
} from "@/features/accounts/actions";
import { authFormStyles } from "@/styles/tw";

const initialState: AuthFormState = {
  message: null,
  error: null
};

function SubmitButton({ label }: { label: string }) {
  return (
    <button className={authFormStyles.submit} type="submit">
      {label}
    </button>
  );
}

export function AuthForms() {
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);

  return (
    <div className={authFormStyles.panel}>
      <form action={signInAction} className={authFormStyles.form}>
        <label className={authFormStyles.field}>
          <span className={authFormStyles.label}>Email</span>
          <input className={authFormStyles.input} name="email" type="email" autoComplete="email" required />
        </label>
        <label className={authFormStyles.field}>
          <span className={authFormStyles.label}>Password</span>
          <input
            className={authFormStyles.input}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {signInState.error ? <p className={authFormStyles.formError}>{signInState.error}</p> : null}
        {signInState.message ? <p className={authFormStyles.formMessage}>{signInState.message}</p> : null}
        <SubmitButton label="Sign in" />
        <p className={authFormStyles.formMessage}>
          Access is invite-only. Ask an administrator to provision your account.
        </p>
      </form>
    </div>
  );
}
