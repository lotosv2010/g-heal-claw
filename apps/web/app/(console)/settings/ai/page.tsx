"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { AiConfigForm } from "@/components/settings/ai-config-form";
import { HealJobsTable } from "@/components/settings/heal-jobs-table";
import { useActiveProject } from "@/lib/hooks/use-active-project";

export default function AiSettingsPage() {
  const projectId = useActiveProject();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="AI 修复配置"
        description="配置代码仓库，启用 AI 自动修复能力。AI 将分析异常堆栈、定位源码、生成修复代码并创建 Pull Request。"
      />

      <AiConfigForm projectId={projectId} />

      <HealJobsTable projectId={projectId} />

      {/* 流程说明 */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-medium mb-2">自动修复流程</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>上传 Sourcemap 文件（设置 → Source Map）</li>
          <li>配置代码仓库地址和分支（本页面）</li>
          <li>异常发生时系统自动还原堆栈到源码位置</li>
          <li>在 Issue 详情或 AI 对话中点击「触发自动修复」</li>
          <li>AI Agent 分析源码 → 生成修复补丁 → 创建 Pull Request</li>
          <li>开发者审核 PR 并合并</li>
        </ol>
      </div>
    </div>
  );
}
