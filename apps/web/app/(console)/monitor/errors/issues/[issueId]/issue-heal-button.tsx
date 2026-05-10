"use client";

import { HealTriggerButton } from "@/components/ai/heal-trigger-button";
import { useActiveProject } from "@/lib/hooks/use-active-project";

export function IssueHealButton({ issueId }: { issueId: string }) {
  const projectId = useActiveProject();
  return <HealTriggerButton projectId={projectId} issueId={issueId} />;
}
