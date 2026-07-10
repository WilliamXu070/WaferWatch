"use client";

import { useActionState, useState } from "react";
import {
  requestPasswordResetFormAction,
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
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);
  const [signUpState, signUpAction] = useActionState(signUpFormAction, initialState);
  const [resendState, resendAction] = useActionState(resendConfirmationFormAction, initialState);
  const [recoveryState, recoveryAction] = useActionState(requestPasswordResetFormAction, initialState);
  const activeState = mode === "signin" ? signInState : signUpState;

  if (showPasswordRecovery) {
    return (
      <div className={authFormStyles.panel}>
        <div>
          <p className={authFormStyles.recoveryTitle}>Reset your password</p>
          <p className={authFormStyles.recoveryCopy}>Enter your account email and we will send you a secure reset link.</p>
        </div>
        <form action={recoveryAction} className={authFormStyles.form}>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>Email</span>
            <input className={authFormStyles.input} name="email" type="email" autoComplete="email" required autoFocus />
          </label>
          {recoveryState.error ? <p className={authFormStyles.formError}>{recoveryState.error}</p> : null}
          {recoveryState.message ? <p className={authFormStyles.formMessage}>{recoveryState.message}</p> : null}
          <SubmitButton label="Send reset link" />
        </form>
        <button type="button" className={authFormStyles.textButton} onClick={() => setShowPasswordRecovery(false)}>
          Back to sign in
        </button>
      </div>
    );
  }

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
        <div className={authFormStyles.field}>
          <span className={authFormStyles.passwordLabelRow}>
            <label className={authFormStyles.label} htmlFor="auth-password">Password</label>
            {mode === "signin" ? (
              <button
                type="button"
                className={authFormStyles.textButton}
                onClick={() => setShowPasswordRecovery(true)}
              >
                Forgot password?
              </button>
            ) : null}
          </span>
          <input
            id="auth-password"
            className={authFormStyles.input}
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </div>
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
