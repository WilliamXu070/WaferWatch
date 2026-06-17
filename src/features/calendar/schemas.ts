import { z } from "zod";
import { uuidSchema } from "@/lib/validation";

export const processCalendarLocationSchema = z.enum(["McMaster", "Waterloo", "Toronto"]);

export const processCalendarEventCreateSchema = z
  .object({
    processTemplateId: uuidSchema,
    location: processCalendarLocationSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    processStepId: uuidSchema.nullable().optional(),
    manualAction: z.string().trim().max(160).nullable().optional(),
    description: z.string().trim().max(1200).nullable().optional(),
    personIds: z.array(uuidSchema).min(1, "Assign at least one person.")
  })
  .superRefine((value, context) => {
    const hasStep = Boolean(value.processStepId);
    const hasManualAction = Boolean(value.manualAction?.trim());

    if (!hasStep && !hasManualAction) {
      context.addIssue({
        code: "custom",
        message: "Choose a process step or enter a manual action.",
        path: ["manualAction"]
      });
    }

    const startsAt = new Date(value.startsAt);
    const endsAt = new Date(value.endsAt);

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Event end time must be after the start time.",
        path: ["endsAt"]
      });
    }
  });

export const processCalendarEventDeleteSchema = z.object({
  eventId: uuidSchema
});

export const processCalendarEventMoveSchema = z
  .object({
    eventId: uuidSchema,
    location: processCalendarLocationSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime()
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt);
    const endsAt = new Date(value.endsAt);

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Event end time must be after the start time.",
        path: ["endsAt"]
      });
    }
  });
