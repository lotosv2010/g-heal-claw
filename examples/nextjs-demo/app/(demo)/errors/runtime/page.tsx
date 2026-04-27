"use client";

import { useState } from "react";

/**
 * 运行时 TypeError 场景
 *
 * 常见线上事故：访问 undefined.property / 调用非函数。
 * 触发后同步抛错，依赖 window.onerror 捕获；本页提供三种经典变体。
 */
interface MaybeUser {
  readonly profile?: {
    readonly nickname?: string;
  };
}

export default function RuntimeErrorPage() {
  const [hits, setHits] = useState(0);

  const accessUndefined = () => {
    setHits((n) => n + 1);
    const user = {} as MaybeUser;
    // 故意深取一个不存在的属性
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = (user.profile as any).nickname as string;
    // eslint-disable-next-line no-console
    console.log(bad.toUpperCase());
  };

  const callNonFunction = () => {
    setHits((n) => n + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = { foo: 1 } as any;
    obj.foo(); // TypeError: obj.foo is not a function
  };

  const nullDeref = () => {
    setHits((n) => n + 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = null as any;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const x = data.items.length;
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Runtime TypeError</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        三种最常见的线上 TypeError：访问 undefined 深层属性、调用非函数值、null.x。
        这些都是同步异常，由 window.onerror 兜底捕获。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accessUndefined}
          className="rounded border border-red-600 bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
        >
          读 undefined 属性
        </button>
        <button
          type="button"
          onClick={callNonFunction}
          className="rounded border border-amber-600 bg-amber-600 px-4 py-2 text-sm text-white transition hover:bg-amber-700"
        >
          调用非函数
        </button>
        <button
          type="button"
          onClick={nullDeref}
          className="rounded border border-purple-600 bg-purple-600 px-4 py-2 text-sm text-white transition hover:bg-purple-700"
        >
          null 解引用
        </button>
      </div>
      <p className="text-xs text-neutral-500">已触发 {hits} 次</p>
    </section>
  );
}
