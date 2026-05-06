import { listProjects } from "@/lib/api/projects";
import { ProjectsClient } from "@/components/settings/projects-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const result = await listProjects();

  return (
    <div className="mx-auto max-w-3xl">
      {result.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败，请检查服务端连接
        </Badge>
      )}
      <ProjectsClient initialProjects={[...result.data]} />
    </div>
  );
}
