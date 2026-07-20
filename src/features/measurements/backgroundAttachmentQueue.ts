export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}

export function getStableAttachmentObjectPath({
  projectId,
  waferId,
  dieLabel,
  category,
  noteId,
  fileIndex,
  fileName
}: {
  projectId: string;
  waferId: string;
  dieLabel: string;
  category: string;
  noteId: string;
  fileIndex: number;
  fileName: string;
}) {
  return `${projectId}/wafers/${waferId}/dies/${dieLabel}/${category}/${noteId}/${fileIndex}-${fileName}`;
}
