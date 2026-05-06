import { listAlertRules, listAlertHistory } from "@/lib/api/alerts";
import { listProjects } from "@/lib/api/projects";
import { AlertsClient } from "@/components/settings/alerts-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const projectsResult = await listProjects();
  const projectId = projectsResult.data[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-lg font-semibold">告警规则</h1>
        <p className="text-muted-foreground py-20 text-center text-sm">
          请先创建项目后再管理告警规则
        </p>
      </div>
    );
  }

  const [rulesResult, historyResult] = await Promise.all([
    listAlertRules(projectId),
    listAlertHistory(projectId, { limit: 50 }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      {rulesResult.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败
        </Badge>
      )}
      <AlertsClient
        projectId={projectId}
        initialRules={[...rulesResult.data]}
        initialHistory={[...historyResult.data]}
      />
    </div>
  );
}
