"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { httpGet } from "@/lib/api/http";

interface ProjectItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

const PROJECT_COOKIE = "ghc-project";

function getStoredProjectId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PROJECT_COOKIE}=`));
  return match?.split("=")[1] ?? null;
}

function storeProjectId(id: string): void {
  document.cookie = `${PROJECT_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function ProjectSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = React.useState<ProjectItem[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    httpGet<{ data: ProjectItem[] }>("/api/v1/projects")
      .then((res) => {
        if (cancelled) return;
        const items = res.data ?? [];
        setProjects(items);

        // 用 slug 作为标识（事件表 project_id 存的是 DSN 路径段 = slug）
        const storedSlug = getStoredProjectId();
        const match = items.find((p) => p.slug === storedSlug);
        const selected = match ?? items[0];
        if (selected) {
          setCurrentId(selected.slug);
          storeProjectId(selected.slug);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const current = projects.find((p) => p.slug === currentId);

  const handleSelect = (project: ProjectItem) => {
    setCurrentId(project.slug);
    storeProjectId(project.slug);
    router.refresh();
  };

  if (!loaded) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled>
        <span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden />
        <span>加载中...</span>
      </Button>
    );
  }

  if (!current) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled>
        <span>无项目</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>{current.name}</span>
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        <DropdownMenuLabel className="text-xs">切换项目</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => handleSelect(p)}
            className={p.id === currentId ? "bg-accent" : ""}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <span>{p.name}</span>
            <span className="text-muted-foreground ml-auto text-xs">{p.slug}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
