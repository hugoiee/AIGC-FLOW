"use client";

import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateProjectDialogProps = {
  /** 触发按钮，由调用方决定样式（空状态页和列表页头部的按钮长得不一样） */
  trigger: ReactNode;
  onCreate: (name: string) => Promise<void>;
};

export function CreateProjectDialog({ trigger, onCreate }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName("");
      setOpen(false);
    } catch {
      setError("创建失败，请检查后端服务是否正常");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // 关闭时清空，避免下次打开还留着上次的输入和报错
    if (!next) {
      setName("");
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>给项目起个名字，之后可以在里面搭建节点画布。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <Label htmlFor="project-name">项目名称</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="如「赛博朋克短片」"
              maxLength={100}
              autoComplete="off"
              autoFocus
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!trimmed || submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
