/**
 * 项目管理 API 客户端（对齐 ADR-0032 ProjectsController）
 *
 * 端点前缀: /api/v1/projects
 * 鉴权: JWT Bearer（Server Component 从 cookie 注入）
 */

import { dashboardFetch } from "./server-fetch";
import { httpPost, httpPatch, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly platform: string | null;
  readonly retentionDays: number;
  readonly createdAt: string;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly slug: string;
  readonly platform?: string;
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly slug?: string;
  readonly platform?: string;
  readonly retentionDays?: number;
}

export type ProjectsSource = "live" | "empty" | "error";

export interface ProjectsResult {
  readonly source: ProjectsSource;
  readonly data: readonly Project[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function listProjects(): Promise<ProjectsResult> {
  const url = `${baseUrl()}/api/v1/projects`;
  try {
    const res = await dashboardFetch(url);
    if (!res.ok) {
      console.error(`[projects] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: Project[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[projects] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const json = await httpPost<{ data: Project }>("/api/v1/projects", input);
  return json.data;
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const json = await httpPatch<{ data: Project }>(`/api/v1/projects/${projectId}`, input);
  return json.data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await httpDelete(`/api/v1/projects/${projectId}`);
}
