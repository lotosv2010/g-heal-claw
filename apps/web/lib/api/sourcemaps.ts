/**
 * Sourcemap 管理 API 客户端
 *
 * 端点前缀: /dashboard/v1/settings/sourcemaps
 * 鉴权: JWT Bearer（代理层统一走 JWT，不暴露 X-Api-Key）
 */

import { dashboardFetch } from "./server-fetch";
import { httpGet, httpPost, httpDelete, getApiBaseUrl } from "./http";
import { getAccessToken } from "../auth";

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

/** 创建 Release（幂等） */
export async function createRelease(
  projectId: string,
  version: string,
  commitSha?: string,
): Promise<Release> {
  const res = await httpPost<{ data: Release }>(
    `/dashboard/v1/settings/sourcemaps/releases?projectId=${projectId}`,
    { version, commitSha: commitSha || undefined },
  );
  return res.data;
}

/** 上传 Artifact（multipart，支持进度回调） */
export async function uploadArtifact(
  projectId: string,
  releaseId: string,
  filename: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Artifact> {
  const formData = new FormData();
  formData.append("filename", filename);
  formData.append("file", file);

  const base = getApiBaseUrl();
  const url = `${base}/dashboard/v1/settings/sourcemaps/releases/${releaseId}/artifacts?projectId=${projectId}`;
  const token = getAccessToken();

  // 使用 XMLHttpRequest 获取上传进度
  if (onProgress) {
    return new Promise<Artifact>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const json = JSON.parse(xhr.responseText);
          resolve((json as { data: Artifact }).data);
        } else {
          reject(new Error(`上传失败: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("网络错误"));
      xhr.send(formData);
    });
  }

  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string })?.message ?? `上传失败: ${res.status}`);
  }
  const json = await res.json();
  return (json as { data: Artifact }).data;
}
