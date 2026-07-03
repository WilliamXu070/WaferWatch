"use client";

import { useActionState, useState } from "react";
import {
  signInFormAction,
  signUpFormAction,
  type AuthFormState
} from "@/features/accounts/actions";
import { authFormStyles, cn } from "@/styles/tw";

const initialState: AuthFormState = {
  message: null,
  error: null
};

type AuthMode = "signin" | "signup";

function SubmitButton({ label }: { label: string }) {
  return (
    <button className={authFormStyles.submit} type="submit">
      {label}
    </button>
  );
}

export function AuthForms() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);
  const [signUpState, signUpAction] = useActionState(signUpFormAction, initialState);
  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;

  return (
    <div className={authFormStyles.panel}>
      <div className={authFormStyles.modeSwitch}>
        <button
          type="button"
          className={cn(
            authFormStyles.modeButtonBase,
            isSignIn ? authFormStyles.modeButtonActive : authFormStyles.modeButtonInactive
          )}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={cn(
            authFormStyles.modeButtonBase,
            isSignIn ? authFormStyles.modeButtonInactive : authFormStyles.modeButtonActive
          )}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      {isSignIn ? (
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
          {state.error ? <p className={authFormStyles.formError}>{state.error}</p> : null}
          {state.message ? <p className={authFormStyles.formMessage}>{state.message}</p> : null}
          <SubmitButton label="Sign in" />
        </form>
      ) : (
        <form action={signUpAction} className={authFormStyles.form}>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>Name</span>
            <input className={authFormStyles.input} name="displayName" type="text" autoComplete="name" required />
          </label>
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {state.error ? <p className={authFormStyles.formError}>{state.error}</p> : null}
          {state.message ? <p className={authFormStyles.formMessage}>{state.message}</p> : null}
          <SubmitButton label="Create account" />
        </form>
      )}
    </div>
  );
}
