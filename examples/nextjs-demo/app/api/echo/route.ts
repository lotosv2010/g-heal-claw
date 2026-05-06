import { NextRequest, NextResponse } from "next/server";

/**
 * 通用 echo 端点：用于 demo 场景中触发 SDK 的 apiPlugin / httpPlugin 采集
 *
 * - 默认返回 200 JSON
 * - ?status=500 → 返回对应状态码（模拟错误 API）
 * - ?delay=1000 → 延迟 N ms 后响应（模拟慢 API）
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const status = Number(searchParams.get("status")) || 200;
  const delay = Number(searchParams.get("delay")) || 0;
  const caseId = searchParams.get("case") ?? "default";

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 10000)));
  }

  const body = {
    case: caseId,
    status,
    delay,
    ts: Date.now(),
  };

  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
