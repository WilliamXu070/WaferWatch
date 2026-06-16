"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { requireAccount, assertProjectAccess } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nullableFormString, formString } from "@/lib/validation";
import { projectCreateSchema, projectMemberSchema } from "@/features/projects/schemas";

export async function createProject(formData: FormData) {
  try {
    const account = await requireAccount();
    const parsed = projectCreateSchema.parse({
      name: formString(formData, "name"),
      slug: formString(formData, "slug"),
      description: nullableFormString(formData, "description"),
      visibility: formString(formData, "visibility") || "private"
    });

    const supabase = await createServerSupabaseClient();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        ...parsed,
        owner_id: account.userId
      })
      .select("*")
      .single();

    if (projectError) {
      return fail(projectError.message);
    }

    const { error: memberError } = await supabase.from("project_members").insert({
      project_id: project.id,
      user_id: account.userId,
      role: "owner"
    });

    if (memberError) {
      return fail(memberError.message);
    }

    revalidatePath("/", "layout");
    return ok(project);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function addProjectMember(input: {
  projectId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
}) {
  try {
    const parsed = projectMemberSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("project_members")
      .upsert({
        project_id: parsed.projectId,
        user_id: parsed.userId,
        role: parsed.role
      })
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
