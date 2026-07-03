import {
  crmDashboardWireframeModel,
  crmDashboardStatusClassName,
  crmDashboardWorkflowColumnClassName
} from "@/ui/crm-dashboard-wireframe";
import { CrmDashboardWireframe } from "@/ui/crm-dashboard-wireframe/components/CrmDashboardWireframe";

export default function CrmDashboardWireframePreviewPage() {
  return (
    <CrmDashboardWireframe
      model={crmDashboardWireframeModel}
      statusClassNameByState={crmDashboardStatusClassName}
      workflowColumnClassNameByStage={crmDashboardWorkflowColumnClassName}
      selectedCardClassName="border-[#181816] bg-[#1f1f1d] text-[#f0f0ec]"
    />
  );
}
