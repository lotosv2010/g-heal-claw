import { listMembers } from "@/lib/api/members";
import { listProjects } from "@/lib/api/projects";
import { getActiveProjectId } from "@/lib/api/context";
import { MembersClient } from "@/components/settings/members-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const projectsResult = await listProjects();
  const activeSlug = await getActiveProjectId();

  // 根据 Cookie 中的 slug 查找对应的 project.id
  const currentProject = projectsResult.data.find((p) => p.slug === activeSlug);
  const projectId = currentProject?.id ?? projectsResult.data[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-lg font-semibold">成员与权限</h1>
        <p className="text-muted-foreground py-20 text-center text-sm">
          请先创建项目后再管理成员
        </p>
      </div>
    );
  }

  const result = await listMembers(projectId);

  return (
    <div className="mx-auto max-w-3xl">
      {result.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败
        </Badge>
      )}
      <MembersClient projectId={projectId} initialMembers={[...result.data]} />
    </div>
  );
}
