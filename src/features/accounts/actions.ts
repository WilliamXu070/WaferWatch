"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { formString } from "@/lib/validation";
import { getAppUrl } from "@/lib/app-url";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const emailSchema = z.object({
  email: z.string().email()
});

function isHtmlParseError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Unexpected token '<'")
  );
}

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  labGroup: z.string().trim().min(1).max(160).default("McMaster Quantum Photonic Group")
});

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

export async function signUpWithPassword(formData: FormData) {
  const parsed = authSchema
    .extend({
      displayName: z.string().trim().min(1).max(120).optional()
    })
    .parse({
      email: formString(formData, "email"),
      password: formString(formData, "password"),
      displayName: formString(formData, "displayName") || undefined
    });

  const supabase = await createServerSupabaseClient();
  const emailRedirectTo = `${getAppUrl()}/auth/confirm?next=/dashboard`;
  const { error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      emailRedirectTo,
      data: {
        display_name: parsed.displayName
      }
    }
  });

  if (error) {
    return fail(error.message);
  }

  return ok({ message: "Check your email to confirm your account if email confirmation is enabled." });
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

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateCurrentProfile(formData: FormData) {
  try {
    const account = await requireAccount();
    const parsed = profileUpdateSchema.parse({
      displayName: formString(formData, "displayName"),
      labGroup: formString(formData, "labGroup") || "McMaster Quantum Photonic Group"
    });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .update({
        display_name: parsed.displayName,
        lab_group: parsed.labGroup
      })
      .eq("id", account.userId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
