"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { httpPatch } from "@/lib/api/http";
import { getActiveProjectId } from "@/lib/api/context";

interface IssueStatusActionsProps {
  readonly issueId: string;
  readonly currentStatus: string;
}

export function IssueStatusActions({
  issueId,
  currentStatus,
}: IssueStatusActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStatusChange(newStatus: string): Promise<void> {
    setLoading(true);
    try {
      const projectId = await getActiveProjectId();
      await httpPatch(
        `/dashboard/v1/issues/${issueId}/status?projectId=${projectId}`,
        { status: newStatus },
      );
      router.refresh();
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {currentStatus !== "resolved" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => handleStatusChange("resolved")}
        >
          标记已解决
        </Button>
      )}
      {currentStatus !== "ignored" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => handleStatusChange("ignored")}
        >
          忽略
        </Button>
      )}
      {currentStatus !== "open" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => handleStatusChange("open")}
        >
          重新打开
        </Button>
      )}
    </div>
  );
}
