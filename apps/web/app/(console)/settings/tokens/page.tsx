import { listTokens } from "@/lib/api/tokens";
import { listProjects } from "@/lib/api/projects";
import { TokensClient } from "@/components/settings/tokens-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const projectsResult = await listProjects();
  const projectId = projectsResult.data[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-lg font-semibold">API Keys</h1>
        <p className="text-muted-foreground py-20 text-center text-sm">
          请先创建项目后再管理 Token
        </p>
      </div>
    );
  }

  const result = await listTokens(projectId);

  return (
    <div className="mx-auto max-w-3xl">
      {result.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败
        </Badge>
      )}
      <TokensClient projectId={projectId} initialTokens={[...result.data]} />
    </div>
  );
}
