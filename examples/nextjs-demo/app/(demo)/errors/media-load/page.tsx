"use client";

import { useState } from "react";

/**
 * 音视频资源加载失败（subType=resource, resource_kind=media）场景
 *
 * 动态插入 <video src="/404.mp4">，浏览器触发 error 事件；ErrorPlugin 按 tagName=VIDEO
 * 或 url 后缀 .mp4 分类为 media。
 *
 * 注：部分浏览器的 <video> 即便 src 404 也可能不触发 error 事件（例如 Safari），
 * 因此同时保留 <audio> 兜底；两者任一触发即上报一次。
 */
export default function MediaLoadPage() {
  const [nonce, setNonce] = useState(0);
  const brokenVideo = `/__ghc_not_exists__/${nonce}.mp4`;
  const brokenAudio = `/__ghc_not_exists__/${nonce}.mp3`;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">音视频资源加载失败</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        指向不存在的 <code>mp4 / mp3</code>；resource_kind = media，归类到 9 分类
        卡片「音视频资源异常」。
      </p>
      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        className="rounded border border-pink-600 bg-pink-600 px-4 py-2 text-sm text-white transition hover:bg-pink-700"
      >
        刷新（第 {nonce + 1} 次）
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-dashed border-pink-400 p-3">
          <video
            key={`v-${nonce}`}
            src={brokenVideo}
            controls
            className="w-full"
          />
          <p className="mt-2 text-xs text-neutral-500 break-all">
            video：{brokenVideo}
          </p>
        </div>
        <div className="rounded border border-dashed border-pink-400 p-3">
          <audio key={`a-${nonce}`} src={brokenAudio} controls className="w-full" />
          <p className="mt-2 text-xs text-neutral-500 break-all">
            audio：{brokenAudio}
          </p>
        </div>
      </div>
    </section>
  );
}
