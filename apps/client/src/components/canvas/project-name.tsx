"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ProjectNameProps = {
  name: string;
  /** 抛错则回滚到原名称 */
  onRename: (name: string) => Promise<void>;
};

/** 双击进入编辑：Enter / 失焦提交，Esc 取消 */
export function ProjectName({ name, onRename }: ProjectNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 提交和失焦可能先后触发，用它保证只提交一次
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startEditing() {
    committedRef.current = false;
    setDraft(name);
    setEditing(true);
  }

  async function commit() {
    if (committedRef.current) return;
    committedRef.current = true;

    const next = draft.trim();
    setEditing(false);
    if (!next || next === name) {
      setDraft(name);
      return;
    }

    setSaving(true);
    try {
      await onRename(next);
    } catch {
      setDraft(name); // 失败回滚，不让界面显示一个其实没存下的名字
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    committedRef.current = true;
    setDraft(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={100}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") cancel();
          // 画布的快捷键挂在 window 上，输入时别让它们抢走按键
          event.stopPropagation();
        }}
        className="w-40 rounded border bg-background px-1.5 py-0.5 font-medium text-sm outline-none ring-2 ring-ring/40"
      />
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={startEditing}
      title="双击重命名"
      className={cn(
        "max-w-40 cursor-text truncate rounded px-1.5 py-0.5 font-medium text-sm hover:bg-muted",
        saving && "opacity-50",
      )}
    >
      {name}
    </button>
  );
}
