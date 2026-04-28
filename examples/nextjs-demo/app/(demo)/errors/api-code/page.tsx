"use client";

import { useState } from "react";

/**
 * 接口业务返回码异常（subType=api_code）场景
 *
 * 由 httpPlugin 自动检测：当 HTTP 2xx 响应体 JSON 的 `code / errno / errCode / status`
 * 为非零（且不是 "0" / "success" / "ok"）时，视为业务异常并上报 api_code 事件。
 *
 * Demo 通过一个 Data URL 返回包含 `code: 500001` 的 JSON，绕过真实后端。
 * 注意：Data URL 的 fetch 在部分浏览器默认允许且返回 200，但各浏览器策略可能不同；
 * 若 Data URL 被阻止，可改为指向 /api/** 的后端 mock。
 */
export default function ApiCodePage() {
  const [count, setCount] = useState(0);

  const fireApiCode = async (): Promise<void> => {
    setCount((n) => n + 1);
    // 构造一个恒定返回 code=500001 的 JSON data URL
    const body = JSON.stringify({
      code: 500001,
      message: "user_not_found",
      data: null,
    });
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
      body,
    )}`;
    try {
      const res = await fetch(dataUrl);
      const json = await res.json();
      console.info("[demo] api_code 响应：", json);
    } catch (err) {
      console.warn("[demo] data url fetch 失败（浏览器策略？）：", err);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">接口返回码异常</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        httpPlugin 在 2xx 响应体中检测到 code ≠ 0 时自动上报 api_code 事件，归类到
        9 分类卡片「接口返回码异常」。
      </p>
      <button
        type="button"
        onClick={fireApiCode}
        className="rounded border border-slate-700 bg-slate-700 px-4 py-2 text-sm text-white transition hover:bg-slate-800"
      >
        触发 code=500001 响应
      </button>
      <p className="text-xs text-neutral-500">已触发 {count} 次</p>
    </section>
  );
}
