import { getActiveProjectId } from "@/lib/api/context";
import { listProjects } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

export default async function DebugQueryPage() {
  const projectsResult = await listProjects();
  const activeSlug = await getActiveProjectId();
  const currentProject = projectsResult.data.find((p) => p.slug === activeSlug);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">调试信息</h1>

      <div className="space-y-4">
        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">Cookie 信息</h2>
          <p>活跃 Slug: <code className="bg-gray-100 px-2 py-1 rounded">{activeSlug}</code></p>
        </section>

        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">当前项目</h2>
          {currentProject ? (
            <div>
              <p>ID: <code className="bg-gray-100 px-2 py-1 rounded">{currentProject.id}</code></p>
              <p>Slug: <code className="bg-gray-100 px-2 py-1 rounded">{currentProject.slug}</code></p>
              <p>Name: {currentProject.name}</p>
            </div>
          ) : (
            <p className="text-red-600">未找到匹配的项目</p>
          )}
        </section>

        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">所有项目</h2>
          <div className="space-y-2">
            {projectsResult.data.map((p) => (
              <div key={p.id} className={`p-2 rounded ${p.slug === activeSlug ? 'bg-green-50' : 'bg-gray-50'}`}>
                <p>ID: <code className="text-xs">{p.id}</code></p>
                <p>Slug: <code className="text-xs">{p.slug}</code></p>
                <p>Name: {p.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">环境变量</h2>
          <p>NEXT_PUBLIC_API_BASE_URL: <code className="bg-gray-100 px-2 py-1 rounded">{process.env.NEXT_PUBLIC_API_BASE_URL || '未设置'}</code></p>
          <p>NEXT_PUBLIC_DEFAULT_PROJECT_ID: <code className="bg-gray-100 px-2 py-1 rounded">{process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID || '未设置'}</code></p>
        </section>

        <section className="border p-4 rounded">
          <h2 className="font-semibold mb-2">查询参数验证</h2>
          <p className="text-sm text-gray-600 mb-2">
            Dashboard API 应该使用 slug (<code>{activeSlug}</code>) 查询事件表
          </p>
          <p className="text-sm text-gray-600">
            Settings API 应该使用 ID (<code>{currentProject?.id || '未知'}</code>) 查询项目表
          </p>
        </section>
      </div>
    </div>
  );
}
