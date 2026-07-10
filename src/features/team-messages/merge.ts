import type { TeamMessage } from "@/types/database";

export function mergeTeamMessages(
  current: readonly TeamMessage[],
  incoming: readonly TeamMessage[],
  limit = 100
) {
  const byId = new Map<string, TeamMessage>();

  for (const message of [...current, ...incoming]) {
    byId.set(message.id, message);
  }

  return [...byId.values()]
    .sort((left, right) => {
      const timeDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
      return timeDifference || left.id.localeCompare(right.id);
    })
    .slice(-limit);
}
