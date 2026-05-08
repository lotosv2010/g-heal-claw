import { httpGet, httpPost, httpDelete } from "./http";

export interface HealJob {
  readonly id: string;
  readonly issueId: string;
  readonly status: "queued" | "diagnosing" | "patching" | "verifying" | "pr_created" | "failed";
  readonly prUrl?: string;
  readonly diagnosis?: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export interface HealJobsResult {
  readonly data: HealJob[];
  readonly pagination: { page: number; limit: number; total: number };
}

export async function listHealJobs(projectId: string, page = 1): Promise<HealJobsResult> {
  return httpGet<HealJobsResult>(`/api/v1/projects/${projectId}/heal?page=${page}&limit=20`);
}

export async function triggerHeal(
  projectId: string,
  issueId: string,
  repoUrl: string,
  branch: string,
): Promise<HealJob> {
  const res = await httpPost<{ data: HealJob }>(
    `/api/v1/projects/${projectId}/issues/${issueId}/heal`,
    { repoUrl, branch },
  );
  return res.data;
}

export async function cancelHealJob(projectId: string, jobId: string): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}/heal/${jobId}`);
}

/** 项目级 AI 配置（前端 localStorage 存储） */
export interface AiConfig {
  repoUrl: string;
  branch: string;
}

const AI_CONFIG_KEY = "ghc-ai-config";

export function getAiConfig(projectId: string): AiConfig | null {
  try {
    const raw = localStorage.getItem(`${AI_CONFIG_KEY}:${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAiConfig(projectId: string, config: AiConfig): void {
  localStorage.setItem(`${AI_CONFIG_KEY}:${projectId}`, JSON.stringify(config));
}
