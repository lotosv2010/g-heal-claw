import { Sparkles } from "lucide-react";
import { PageHeader } from "./page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PlaceholderPageProps {
  readonly title: string;
  readonly phase: string;
}

export function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} description="此功能尚未实现，骨架阶段仅占位。" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Sparkles className="text-muted-foreground/50 size-10" aria-hidden />
          <div className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{title}</span> 将在
            <span className="mx-1">
              <Badge variant="brand">{phase}</Badge>
            </span>
            落地
          </div>
          <p className="text-muted-foreground max-w-md text-xs">
            详见 docs/tasks/CURRENT.md 路线图与 docs/decisions/0012-web-skeleton.md
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
