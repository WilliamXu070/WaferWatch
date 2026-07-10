import { z } from "zod";

export const teamMessageSendSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(4000, "Messages can be up to 4,000 characters.")
});
