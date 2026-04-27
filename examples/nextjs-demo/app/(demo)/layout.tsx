import type { ReactNode } from "react";
import { DemoNav } from "../demo-nav";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-5xl gap-8 px-6 py-10">
      <aside className="w-56 shrink-0">
        <DemoNav />
      </aside>
      <main className="min-w-0 flex-1 space-y-6">{children}</main>
    </div>
  );
}
