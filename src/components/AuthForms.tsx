"use client";

import { useActionState, useState } from "react";
import {
  resendConfirmationFormAction,
  signInFormAction,
  signUpFormAction,
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

export function AuthForms({ showExpiredConfirmation = false }: { showExpiredConfirmation?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);
  const [signUpState, signUpAction] = useActionState(signUpFormAction, initialState);
  const [resendState, resendAction] = useActionState(resendConfirmationFormAction, initialState);
  const activeState = mode === "signin" ? signInState : signUpState;

  return (
    <div className={authFormStyles.panel}>
      <div className={authFormStyles.modeSwitch} role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={[
            authFormStyles.modeButtonBase,
            mode === "signin" ? authFormStyles.modeButtonActive : authFormStyles.modeButtonInactive
          ].join(" ")}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={[
            authFormStyles.modeButtonBase,
            mode === "signup" ? authFormStyles.modeButtonActive : authFormStyles.modeButtonInactive
          ].join(" ")}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form action={mode === "signin" ? signInAction : signUpAction} className={authFormStyles.form}>
        {mode === "signup" ? (
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>Name</span>
            <input className={authFormStyles.input} name="displayName" type="text" autoComplete="name" required />
          </label>
        ) : null}
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
        {activeState.error ? <p className={authFormStyles.formError}>{activeState.error}</p> : null}
        {activeState.message ? <p className={authFormStyles.formMessage}>{activeState.message}</p> : null}
        <SubmitButton label={mode === "signin" ? "Sign in" : "Create account"} />
      </form>

      {showExpiredConfirmation ? (
        <form action={resendAction} className={authFormStyles.resendForm}>
          <div>
            <p className={authFormStyles.resendTitle}>Need a new confirmation link?</p>
            <p className={authFormStyles.resendCopy}>Enter the email address you used to sign up.</p>
          </div>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>Email</span>
            <input className={authFormStyles.input} name="email" type="email" autoComplete="email" required />
          </label>
          {resendState.error ? <p className={authFormStyles.formError}>{resendState.error}</p> : null}
          {resendState.message ? <p className={authFormStyles.formMessage}>{resendState.message}</p> : null}
          <SubmitButton label="Resend confirmation email" />
        </form>
      ) : null}
    </div>
  );
}
