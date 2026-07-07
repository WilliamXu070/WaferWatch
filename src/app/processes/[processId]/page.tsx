import { redirect } from "next/navigation";

export default async function ProcessDashboardPage({
  params
}: {
  params: Promise<{ processId: string }>;
}) {
  const processId = (await params).processId;
  redirect(`/process-flow?processId=${encodeURIComponent(processId)}`);
}
