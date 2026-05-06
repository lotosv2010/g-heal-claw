/**
 * Sourcemap 管理 API 客户端（对齐 ADR-0033 Dashboard 代理端点）
 *
 * 端点前缀: /dashboard/v1/settings/sourcemaps
 * 鉴权: JWT Bearer（代理层统一走 JWT，不暴露 X-Api-Key）
 */

import { dashboardFetch } from "./server-fetch";
import { httpGet, httpDelete } from "./http";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface Release {
  readonly id: string;
  readonly version: string;
  readonly commitSha: string | null;
  readonly artifactCount: number;
  readonly createdAt: string;
}

export interface Artifact {
  readonly id: string;
  readonly filename: string;
  readonly mapFilename: string;
  readonly fileSize: number;
  readonly createdAt: string;
}

export type SourcemapsSource = "live" | "empty" | "error";

export interface ReleasesResult {
  readonly source: SourcemapsSource;
  readonly data: readonly Release[];
}

export interface ArtifactsResult {
  readonly source: SourcemapsSource;
  readonly data: readonly Artifact[];
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export async function listReleases(projectId: string): Promise<ReleasesResult> {
  const url = `${baseUrl()}/dashboard/v1/settings/sourcemaps/releases?projectId=${projectId}`;
  try {
    const res = await dashboardFetch(url);
    if (!res.ok) {
      console.error(`[sourcemaps] ${res.status} ${res.statusText}`);
      return { source: "error", data: [] };
    }
    const json = (await res.json()) as { data?: Release[] };
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[sourcemaps] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

export async function listArtifacts(
  projectId: string,
  releaseId: string,
): Promise<ArtifactsResult> {
  try {
    const json = await httpGet<{ data?: Artifact[] }>(
      `/dashboard/v1/settings/sourcemaps/releases/${releaseId}/artifacts?projectId=${projectId}`,
    );
    const items = json.data ?? [];
    return { source: items.length > 0 ? "live" : "empty", data: items };
  } catch (err) {
    console.error("[sourcemaps/artifacts] fetch failed:", (err as Error).message);
    return { source: "error", data: [] };
  }
}

export async function deleteRelease(
  projectId: string,
  releaseId: string,
): Promise<void> {
  await httpDelete(`/dashboard/v1/settings/sourcemaps/releases/${releaseId}?projectId=${projectId}`);
}
