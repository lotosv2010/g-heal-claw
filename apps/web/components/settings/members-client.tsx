"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "./confirm-dialog";
import { InviteMemberDialog } from "./invite-member-dialog";
import {
  removeMember,
  updateMemberRole,
  type Member,
  type MemberRole,
} from "@/lib/api/members";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
  viewer: "观察者",
};

const ROLE_VARIANTS: Record<MemberRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
  viewer: "outline",
};

interface MembersClientProps {
  readonly projectId: string;
  readonly initialMembers: readonly Member[];
}

export function MembersClient({ projectId, initialMembers }: MembersClientProps) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const refresh = () => router.refresh();

  const handleRoleChange = async (userId: string, role: MemberRole) => {
    try {
      await updateMemberRole(projectId, userId, role);
      refresh();
    } catch {
      // 静默
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeMember(projectId, removeTarget.userId);
      setRemoveTarget(null);
      refresh();
    } catch {
      // 静默
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">成员与权限</h1>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" />
          邀请成员
        </Button>
      </div>

      {initialMembers.length === 0 ? (
        <p className="text-muted-foreground py-20 text-center text-sm">暂无成员</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialMembers.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="text-sm">{m.email}</TableCell>
                <TableCell className="text-sm">{m.displayName ?? "-"}</TableCell>
                <TableCell>
                  {m.role === "owner" ? (
                    <Badge variant={ROLE_VARIANTS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                  ) : (
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleRoleChange(m.userId, v as MemberRole)}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["admin", "member", "viewer"] as const).map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(m.joinedAt).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell>
                  {m.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive text-xs"
                      onClick={() => setRemoveTarget(m)}
                    >
                      移除
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <InviteMemberDialog
        projectId={projectId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={refresh}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(v) => { if (!v) setRemoveTarget(null); }}
        title="移除成员"
        description={`确定移除「${removeTarget?.email ?? ""}」？`}
        confirmLabel="移除"
        destructive
        loading={removing}
        onConfirm={handleRemove}
      />
    </>
  );
}
