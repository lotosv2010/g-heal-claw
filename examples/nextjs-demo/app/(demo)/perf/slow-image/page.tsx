"use client";

import { useState } from "react";

/**
 * 大图作为 LCP 候选
 *
 * 使用 picsum 公共图片服务按尺寸返回不同体积图像；切换尺寸并刷新可观察
 * LCP 数值变化；图片 URL 添加随机 query 规避 CDN 缓存。
 */
const SIZES = [
  { label: "Small 400×300", w: 400, h: 300 },
  { label: "Medium 1200×800", w: 1200, h: 800 },
  { label: "Large 2400×1600", w: 2400, h: 1600 },
] as const;

export default function SlowImagePage() {
  const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[1]);
  const cacheBust = Date.now();
  const src = `https://picsum.photos/${size.w}/${size.h}?r=${cacheBust}`;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Slow Image → LCP</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        切换图片尺寸后刷新页面观察 LCP；网络面板可看到图像下载耗时。
      </p>
      <div className="flex gap-2 text-sm">
        {SIZES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSize(s)}
            className={`rounded border px-3 py-1 transition ${
              size.label === s.label
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="LCP 目标"
        width={size.w}
        height={size.h}
        className="max-w-full rounded shadow"
      />
    </section>
  );
}
