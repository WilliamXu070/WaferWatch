import { z } from "zod";
import { slugSchema, uuidSchema } from "@/lib/validation";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  visibility: z.enum(["private", "group"]).default("private")
});

export const projectMemberSchema = z.object({
  projectId: uuidSchema,
  userId: uuidSchema,
  role: z.enum(["owner", "editor", "viewer"])
});
