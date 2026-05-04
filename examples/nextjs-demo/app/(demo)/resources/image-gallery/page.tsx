"use client";

import { useState } from "react";

/**
 * 图片批量加载演示 → 驱动 `resourcePlugin` 采集 type='resource' 的 image 样本
 *
 * 目的：一次性加载一组随机图片，产生 N 条 image 类 PerformanceResourceTiming 样本，
 * 便于在 `/monitor/resources` 大盘观察：
 *  - 「资源分类」中 image 桶 count 上升
 *  - 「Top 慢资源」中体积大的图可能命中慢阈值
 *  - 「Top 失败 Host」在图片 host 返回 404 时命中失败率排序
 *
 * 对照：`(demo)/errors/image-load` 演示的是 404 图片加载失败上报到 type='error'；
 * 本页演示的是正常样本的全量采集（type='resource'）。两者互补，无重复统计。
 */
const SIZES = [
  { label: "小图 ×10 400×300", w: 400, h: 300, count: 10 },
  { label: "中图 ×10 1200×800", w: 1200, h: 800, count: 10 },
  { label: "大图 ×5 2400×1600", w: 2400, h: 1600, count: 5 },
] as const;

export default function ImageGalleryPage() {
  const [preset, setPreset] = useState<(typeof SIZES)[number]>(SIZES[1]);
  const [epoch, setEpoch] = useState<number>(Date.now());

  const images = Array.from({ length: preset.count }, (_, i) => {
    return `https://picsum.photos/${preset.w}/${preset.h}?r=${epoch}-${i}`;
  });

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">图片批量 → 静态资源大盘</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        一次加载多张随机图片，每张图会产生一条 PerformanceResourceTiming（initiatorType=img）样本。
        切换规模后点击「重新加载」以生成新 URL 绕开缓存；在 apps/web `/monitor/resources`
        大盘中可观察到 image 桶计数、Top 慢资源与 Top 失败 Host 的变化。
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {SIZES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setPreset(s)}
            className={`rounded border px-3 py-1 transition ${
              preset.label === s.label
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEpoch(Date.now())}
          className="ml-4 rounded bg-neutral-900 px-3 py-1 text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          重新加载
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {images.map((src) => (
          <img
            key={src}
            src={src}
            alt="resource-demo"
            width={preset.w}
            height={preset.h}
            className="rounded shadow"
          />
        ))}
      </div>
    </section>
  );
}
