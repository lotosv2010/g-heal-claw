import { listChannels } from "@/lib/api/channels";
import { listProjects } from "@/lib/api/projects";
import { ChannelsClient } from "@/components/settings/channels-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const projectsResult = await listProjects();
  const projectId = projectsResult.data[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-lg font-semibold">通知渠道</h1>
        <p className="text-muted-foreground py-20 text-center text-sm">
          请先创建项目后再管理通知渠道
        </p>
      </div>
    );
  }

  const result = await listChannels(projectId);

  return (
    <div className="mx-auto max-w-4xl">
      {result.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败
        </Badge>
      )}
      <ChannelsClient projectId={projectId} initialChannels={[...result.data]} />
    </div>
  );
}
