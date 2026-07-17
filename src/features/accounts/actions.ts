"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail } from "@/lib/action-result";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formString } from "@/lib/validation";
import { getAppUrl } from "@/lib/app-url";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const emailSchema = z.object({
  email: z.string().email()
});

const passwordUpdateSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

function isHtmlParseError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Unexpected token '<'")
  );
}

export async function signInWithPassword(formData: FormData) {
  const parsed = authSchema.parse({
    email: formString(formData, "email"),
    password: formString(formData, "password")
  });

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed);

  if (error) {
    if (isHtmlParseError(error)) {
      return fail("Authentication endpoint returned a non-JSON response. Verify your live Supabase project credentials.");
    }

    return fail(error.message);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type AuthFormState = {
  message: string | null;
  error: string | null;
};

export async function signInFormAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password")
  });

  if (!parsed.success) {
    return {
      message: null,
      error: "Enter a valid email and a password with at least 8 characters."
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (isHtmlParseError(error)) {
      return {
        message: null,
        error: "Authentication endpoint returned a non-JSON response. Verify your live Supabase project credentials."
      };
    }

    return {
      message: null,
      error: error.message
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpFormAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authSchema
    .extend({
      displayName: z.string().trim().min(1).max(120)
    })
    .safeParse({
      email: formString(formData, "email"),
      password: formString(formData, "password"),
      displayName: formString(formData, "displayName")
    });

  if (!parsed.success) {
    return {
      message: null,
      error: "Enter your name, a valid email, and a password with at least 8 characters."
    };
  }

  const supabase = await createServerSupabaseClient();
  const emailRedirectTo = `${getAppUrl()}/auth/confirm?next=/dashboard`;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
      data: {
        display_name: parsed.data.displayName
      }
    }
  });

  if (error) {
    return {
      message: null,
      error: error.message
    };
  }

  revalidatePath("/", "layout");

  if (data.session) {
    redirect("/dashboard");
  }

  return {
    message: "Account created. Confirm your email, then sign in.",
    error: null
  };
}

export async function resendConfirmationFormAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({
    email: formString(formData, "email")
  });

  if (!parsed.success) {
    return {
      message: null,
      error: "Enter a valid email address."
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/confirm?next=/dashboard`
    }
  });

  if (error) {
    return {
      message: null,
      error: error.message
    };
  }

  return {
    message: "If this address is awaiting confirmation, a new link is on its way.",
    error: null
  };
}

export async function requestPasswordResetFormAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({
    email: formString(formData, "email")
  });

  if (!parsed.success) {
    return {
      message: null,
      error: "Enter a valid email address."
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getAppUrl()}/auth/confirm?next=/reset-password`
  });

  if (error) {
    return {
      message: null,
      error: error.message
    };
  }

  return {
    message: "If an account exists for this email, a password reset link is on its way.",
    error: null
  };
}

export async function updatePasswordFormAction(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = passwordUpdateSchema.safeParse({
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword")
  });

  if (!parsed.success) {
    return {
      message: null,
      error: parsed.error.issues[0]?.message ?? "Enter matching passwords with at least 8 characters."
    };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1") {
    return {
      message: null,
      error: "This password reset session is invalid or expired. Request a new reset link."
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password
  });

  if (error) {
    return {
      message: null,
      error: error.message
    };
  }

  await supabase.auth.signOut({ scope: "local" });
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  revalidatePath("/", "layout");
  redirect("/?message=Password updated. Sign in with your new password.");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
