"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 生成节点的浮动菜单放大后的弹层：盖住整个画面，里面是同一套菜单的大号形态
 * （参考素材、提示词、底部选项和生成按钮），专心改一个节点。
 *
 * 两个坑：提示词的 @ 菜单是 portal 到 body 的，Dialog 眼里点它算「点到弹层外面」，
 * 按 role=listbox 放行；焦点由提示词编辑器自己放到末尾（autoFocus），不让 Dialog 抢。
 * 菜单里的 Popover / DropdownMenu 也是 portal 的，但它们是 Radix 自家的嵌套层，
 * Dialog 认得，不用管。
 */
export function GenMenuDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.detail.originalEvent.target as Element | null;
          if (target?.closest('[role="listbox"]')) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            和节点里是同一份内容，改完关掉即可；也可以直接在这里点生成。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
