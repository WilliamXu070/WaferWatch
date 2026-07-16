import type { WaferStatusStepParameterRecord } from "../../types";

function formatRecordedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function StepParameterHistory({ records }: { records: readonly WaferStatusStepParameterRecord[] }) {
  const orderedRecords = [...records].sort((first, second) => second.recordedAt.localeCompare(first.recordedAt));

  return (
    <section className="border-b border-[#eeeeea] bg-white px-4 py-3" aria-label="Selected step parameters">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#777770]">Step parameters</h4>
        {orderedRecords[0] ? (
          <span className="text-[11px] font-medium text-[#92928a]">
            {orderedRecords[0].recordedByName
              ? `Recorded by ${orderedRecords[0].recordedByName}`
              : "Recorded value"}
          </span>
        ) : null}
      </div>
      {orderedRecords.length ? (
        <div className="mt-2 grid gap-2">
          {orderedRecords.map((record, recordIndex) => (
            <details key={record.id} open={recordIndex === 0} className="rounded-lg border border-[#e6e6e0] bg-[#fbfbf8]">
              <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold text-[#4c4c46]">
                {recordIndex === 0 ? "Latest entry" : `Earlier entry ${orderedRecords.length - recordIndex}`}
                <span className="ml-2 font-medium text-[#92928a]">{formatRecordedTime(record.recordedAt)}</span>
              </summary>
              {record.values.length ? (
                <dl className="grid border-t border-[#e6e6e0] sm:grid-cols-2">
                  {record.values.map((parameter) => (
                    <div key={`${record.id}:${parameter.key}`} className="grid grid-cols-[minmax(105px,0.8fr)_minmax(0,1.2fr)] gap-3 border-b border-[#ecece6] px-3 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                      <dt className="truncate text-[12px] font-medium text-[#777770]" title={parameter.label}>{parameter.label}</dt>
                      <dd className="truncate text-right text-[12px] font-semibold text-[#24241f]" title={String(parameter.value ?? "Not recorded")}>
                        {typeof parameter.value === "boolean"
                          ? parameter.value ? "Yes" : "No"
                          : parameter.value ?? "Not recorded"}
                        {parameter.unit && parameter.value !== null ? ` ${parameter.unit}` : ""}
                        {parameter.scope === "local" ? <span className="ml-1.5 text-[10px] font-medium text-[#92928a]">local</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="border-t border-[#e6e6e0] px-3 py-3 text-[12px] text-[#85857d]">No values were recorded.</p>
              )}
              {record.notes ? (
                <p className="border-t border-[#e6e6e0] px-3 py-2.5 text-[12px] leading-5 text-[#5f5f58]">
                  <span className="mr-1.5 font-semibold text-[#3f3f3a]">Additional notes</span>
                  {record.notes}
                </p>
              ) : null}
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-[#ddddda] bg-[#fbfbf8] px-3 py-3 text-[12px] font-medium text-[#85857d]">
          No parameters recorded for this step.
        </p>
      )}
    </section>
  );
}
