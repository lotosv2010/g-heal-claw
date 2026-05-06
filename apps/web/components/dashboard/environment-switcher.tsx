"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ENVIRONMENTS = ["production", "staging", "development"] as const;
const ENV_COOKIE = "ghc-env";

function getStoredEnv(): string {
  if (typeof document === "undefined") return "production";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ENV_COOKIE}=`));
  return match?.split("=")[1] ?? "production";
}

function storeEnv(env: string): void {
  document.cookie = `${ENV_COOKIE}=${env}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function EnvironmentSwitcher() {
  const router = useRouter();
  const [current, setCurrent] = React.useState<string>("production");

  React.useEffect(() => {
    setCurrent(getStoredEnv());
  }, []);

  const handleSelect = (env: string) => {
    setCurrent(env);
    storeEnv(env);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>环境: {current}</span>
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        {ENVIRONMENTS.map((env) => (
          <DropdownMenuItem
            key={env}
            onClick={() => handleSelect(env)}
            className={env === current ? "bg-accent" : ""}
          >
            {env}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
