import { PolingAnalysisMap } from "@/components/analysis/PolingAnalysisMap";
import { getPolingAnalysisData } from "@/features/analysis/queries";
import { resolveActiveProcess } from "@/features/process-selection/server";

export const metadata = {
  title: "Poling analysis · WaferWatch"
};

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const processTemplateId = (await resolveActiveProcess())?.id ?? null;
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
