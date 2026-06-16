"use client";

import { useActionState } from "react";
import { signInFormAction, signUpFormAction, type AuthFormState } from "@/features/accounts/actions";

const initialState: AuthFormState = {
  message: null,
  error: null
};

function SubmitButton({ label }: { label: string }) {
  return <button className="button button-primary" type="submit">{label}</button>;
}

export function AuthForms() {
  const [signInState, signInAction] = useActionState(signInFormAction, initialState);
  const [signUpState, signUpAction] = useActionState(signUpFormAction, initialState);

  return (
    <div className="auth-grid">
      <form action={signInAction} className="panel form-panel">
        <div>
          <p className="eyebrow">Existing account</p>
          <h2>Sign in</h2>
        </div>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        {signInState.error ? <p className="form-error">{signInState.error}</p> : null}
        {signInState.message ? <p className="form-message">{signInState.message}</p> : null}
        <SubmitButton label="Sign in" />
      </form>

      <form action={signUpAction} className="panel form-panel">
        <div>
          <p className="eyebrow">New account</p>
          <h2>Create account</h2>
        </div>
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
        {signUpState.error ? <p className="form-error">{signUpState.error}</p> : null}
        {signUpState.message ? <p className="form-message">{signUpState.message}</p> : null}
        <SubmitButton label="Create account" />
      </form>
    </div>
  );
}
