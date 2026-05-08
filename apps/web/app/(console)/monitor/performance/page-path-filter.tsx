"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PAGES_VALUE = "__all__";

export function PagePathFilter({
  paths,
  currentPath,
}: {
  paths: readonly string[];
  currentPath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (paths.length === 0) return null;

  const value = currentPath ?? ALL_PAGES_VALUE;

  function handleChange(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === ALL_PAGES_VALUE) {
      params.delete("pagePath");
    } else {
      params.set("pagePath", v);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="w-[220px] h-8 text-xs">
        <SelectValue placeholder="全部页面" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PAGES_VALUE}>全部页面（聚合）</SelectItem>
        {paths.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="truncate" title={p}>
              {p.length > 35 ? p.slice(0, 32) + "..." : p}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
