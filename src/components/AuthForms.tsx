"use client";

import { useActionState, useState } from "react";
import {
  signInFormAction,
  signUpFormAction,
  type AuthFormState
} from "@/features/accounts/actions";

const initialState: AuthFormState = {
  message: null,
  error: null
};

type AuthMode = "signin" | "signup";

function SubmitButton({ label }: { label: string }) {
  return <button className="button button-primary" type="submit">{label}</button>;
}

export function AuthForms() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);
  const [signUpState, signUpAction] = useActionState(signUpFormAction, initialState);
  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;

  return (
    <div className="form-panel">
      <div className="auth-mode-switch">
        <button
          type="button"
          className={`auth-mode-btn ${isSignIn ? "active" : ""}`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`auth-mode-btn ${isSignIn ? "" : "active"}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      {isSignIn ? (
        <form action={signInAction} className="auth-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" minLength={8} required />
          </label>
          {state.error ? <p className="form-error">{state.error}</p> : null}
          {state.message ? <p className="form-message">{state.message}</p> : null}
          <SubmitButton label="Sign in" />
        </form>
      ) : (
        <form action={signUpAction} className="auth-form">
          <label>
            Name
            <input name="displayName" type="text" autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          {state.error ? <p className="form-error">{state.error}</p> : null}
          {state.message ? <p className="form-message">{state.message}</p> : null}
          <SubmitButton label="Create account" />
        </form>
      )}
    </div>
  );
}
