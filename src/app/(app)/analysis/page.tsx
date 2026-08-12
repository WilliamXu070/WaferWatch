import { PolingAnalysisMap } from "@/components/analysis/PolingAnalysisMap";
import { getPolingAnalysisData } from "@/features/analysis/queries";
import { getFirstActiveProcessTemplateId } from "@/features/process-flows/queries";

export const metadata = {
  title: "Poling analysis · WaferWatch"
};

export const dynamic = "force-dynamic";

type AnalysisSearchParams = {
  processId?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveProcessTemplateId(requestedProcessId?: string) {
  if (requestedProcessId) return requestedProcessId;

  try {
    return await getFirstActiveProcessTemplateId();
  } catch {
    return null;
  }
}

export default async function AnalysisPage({
  searchParams
}: {
  searchParams: Promise<AnalysisSearchParams>;
}) {
  const requestedProcessId = firstSearchValue((await searchParams).processId);
  const processTemplateId = await resolveProcessTemplateId(requestedProcessId);
  const analysis = await getPolingAnalysisData(processTemplateId);
  const datasetKey =
    analysis.dataSource.kind === "database"
      ? `${analysis.dataSource.projectId}:${analysis.dataSource.importId}`
      : `${processTemplateId ?? "none"}:${analysis.dataSource.reason ?? "unknown"}`;

  return (
    <PolingAnalysisMap
      key={datasetKey}
      records={analysis.records}
      dataSource={analysis.dataSource}
    />
  );
}
