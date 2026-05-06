"use client";

import { useEffect, useState } from "react";

/**
 * 设备上下文采集 Demo（T1.2.4）
 *
 * 展示 SDK 自动采集的设备与网络信息：browser / browserVersion / os / osVersion /
 * deviceType / screen / network (effectiveType / rtt / downlink) / language / timezone。
 *
 * 验证方式：DevTools → Network 查看 POST /ingest/v1/events 的 payload.device 字段。
 * 文档参考：apps/docs/docs/sdk/device-context.md
 */
export default function DeviceContextPage() {
  const [deviceInfo, setDeviceInfo] = useState<Record<string, unknown> | null>(
    null,
  );

  useEffect(() => {
    // 动态导入 SDK context 收集函数，模拟运行时采集
    import("@g-heal-claw/sdk").then(({ collectDevice, collectPage }) => {
      setDeviceInfo({
        device: collectDevice(),
        page: collectPage(),
      });
    });
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        设备上下文采集 · Device Context
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        SDK 在每次事件上报时自动填充 <code>device</code> 和 <code>page</code>{" "}
        字段。本页展示当前浏览器环境下采集到的完整上下文信息。
      </p>

      <div className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-sm font-medium">采集结果</h2>
        {deviceInfo ? (
          <pre className="max-h-[60vh] overflow-auto rounded bg-neutral-100 p-3 text-xs dark:bg-neutral-900">
            {JSON.stringify(deviceInfo, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-neutral-500">加载中…</p>
        )}
      </div>

      <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
        <h2 className="font-medium text-neutral-800 dark:text-neutral-200">
          验证步骤
        </h2>
        <ol className="list-inside list-decimal space-y-1">
          <li>打开 DevTools → Network，筛选 POST 请求</li>
          <li>
            在其他 demo 页面触发任意事件（如点击错误按钮、加载慢图片等）
          </li>
          <li>
            查看 <code>/ingest/v1/events</code> 请求体中 <code>device</code>{" "}
            字段
          </li>
          <li>
            确认包含：<code>browser</code> / <code>browserVersion</code> /{" "}
            <code>os</code> / <code>osVersion</code> / <code>deviceType</code> /{" "}
            <code>network.effectiveType</code>
          </li>
        </ol>
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
        <strong>注意：</strong>
        <code>network</code> 字段依赖{" "}
        <a
          href="https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Network Information API
        </a>
        ，仅 Chromium 内核浏览器支持；Safari / Firefox 下该字段为{" "}
        <code>undefined</code>。
      </div>
    </section>
  );
}
