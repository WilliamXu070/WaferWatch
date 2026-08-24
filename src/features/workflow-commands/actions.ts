"use server";

import { executeWorkflowCommandServer } from "./server";

export async function executeWorkflowCommand(input: unknown) {
  return executeWorkflowCommandServer(input);
}
