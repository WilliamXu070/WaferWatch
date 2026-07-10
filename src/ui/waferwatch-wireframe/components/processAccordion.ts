export function toggleExpandedProcessId(currentId: string | null, processId: string) {
  return currentId === processId ? null : processId;
}
