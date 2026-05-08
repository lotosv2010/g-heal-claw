import { dashboardFetch } from "./server-fetch";
import { getActiveProjectId, getActiveEnvironment } from "./context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export interface DimensionValueItem {
  readonly value: string;
  readonly count: number;
}

export interface DimensionValuesResponse {
  readonly dimension: string;
  readonly values: DimensionValueItem[];
}

export type DimensionSource =
  | "error_events_raw"
  | "api_events_raw"
  | "perf_events_raw"
  | "resource_events_raw"
  | "page_view_raw";

export async function getDimensionValues(
  dimension: string,
  source: DimensionSource = "error_events_raw",
  windowHours = 24,
): Promise<DimensionValuesResponse> {
  const projectId = await getActiveProjectId();
  const environment = await getActiveEnvironment();
  const params = new URLSearchParams({
    projectId,
    dimension,
    source,
    windowHours: String(windowHours),
    limit: "50",
  });
  if (environment) params.set("environment", environment);

  const res = await dashboardFetch(
    `${API_BASE}/dashboard/v1/dimensions/values?${params}`,
  );
  if (!res.ok) return { dimension, values: [] };
  const json = await res.json();
  return json.data as DimensionValuesResponse;
}
