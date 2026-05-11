"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiConfig, saveAiConfig, type AiConfig } from "@/lib/api/heal";

interface Props {
  readonly projectId: string;
}

export function AiConfigForm({ projectId }: Props) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [basePath, setBasePath] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = getAiConfig(projectId);
    if (config) {
      setRepoUrl(config.repoUrl);
      setBranch(config.branch);
      setBasePath(config.basePath ?? "");
      setSaved(true);
    }
  }, [projectId]);

  const handleSave = () => {
    if (!repoUrl.trim()) {
      toast.error("请输入仓库地址");
      return;
    }
    const config: AiConfig = { repoUrl: repoUrl.trim(), branch: branch.trim() || "main", basePath: basePath.trim() };
    saveAiConfig(projectId, config);
    setSaved(true);
    toast.success("AI 修复配置已保存");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">仓库配置</CardTitle>
        <p className="text-muted-foreground text-xs">
          配置代码仓库后，AI 可自动分析源码并生成修复 PR
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="repoUrl">仓库地址</Label>
          <Input
            id="repoUrl"
            placeholder="https://github.com/your-org/your-repo"
            value={repoUrl}
            onChange={(e) => { setRepoUrl(e.target.value); setSaved(false); }}
          />
          <p className="text-muted-foreground text-[11px]">
            支持 GitHub 仓库。AI Agent 将 clone 此仓库分析源码并生成修复 PR。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="branch">默认分支</Label>
          <Input
            id="branch"
            placeholder="main"
            value={branch}
            onChange={(e) => { setBranch(e.target.value); setSaved(false); }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="basePath">源码子目录（可选）</Label>
          <Input
            id="basePath"
            placeholder="例如 examples/vue-demo 或 src"
            value={basePath}
            onChange={(e) => { setBasePath(e.target.value); setSaved(false); }}
          />
          <p className="text-muted-foreground text-[11px]">
            留空则搜索整个仓库。Monorepo 中可指定子包路径，AI 仅在该目录下搜索和修改文件。
          </p>
        </div>
        <Button onClick={handleSave} disabled={saved && !!repoUrl}>
          {saved ? "✓ 已保存" : "保存配置"}
        </Button>
      </CardContent>
    </Card>
  );
}
