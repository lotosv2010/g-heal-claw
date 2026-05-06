import { listReleases } from "@/lib/api/sourcemaps";
import { listProjects } from "@/lib/api/projects";
import { getActiveProjectId } from "@/lib/api/context";
import { SourcemapsClient } from "@/components/settings/sourcemaps-client";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function SourcemapsPage() {
  const projectsResult = await listProjects();
  const activeSlug = await getActiveProjectId();
  const currentProject = projectsResult.data.find((p) => p.slug === activeSlug);
  const projectId = currentProject?.id ?? projectsResult.data[0]?.id;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-lg font-semibold">Source Map</h1>
        <p className="text-muted-foreground py-20 text-center text-sm">
          请先创建项目后再管理 Source Map
        </p>
      </div>
    );
  }

  const result = await listReleases(projectId);

  return (
    <div className="mx-auto max-w-3xl">
      {result.source === "error" && (
        <Badge variant="destructive" className="mb-4">
          数据加载失败
        </Badge>
      )}
      <SourcemapsClient projectId={projectId} initialReleases={[...result.data]} />
    </div>
  );
}
