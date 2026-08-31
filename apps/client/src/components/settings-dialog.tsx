"use client";

import { appSettingsSchema } from "@aigc-flow/shared";
import { Settings } from "lucide-react";
import { type FormEvent, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";

/**
 * 全局设置面板。目前只有一项：内网上传服务根地址。
 * 配置存在服务端 settings 表里，所有浏览器共享同一份。
 */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (!next) return;

    setLoading(true);
    api.api.settings
      .$get()
      .then((res) => res.json())
      .then((data) => setValue(data.uploadBaseUrl))
      .catch(() => setError("读取设置失败，确认 server 已启动"))
      .finally(() => setLoading(false));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // 校验用的是和服务端同一份 shared schema，两边判断永远一致
    const parsed = appSettingsSchema.safeParse({ uploadBaseUrl: value.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "地址格式不正确");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await api.api.settings.$put({ json: parsed.data });
      if (!res.ok) {
        setError("保存失败，请检查地址格式");
        return;
      }
      setOpen(false);
    } catch {
      setError("连不上服务，确认 server 已启动");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="设置">
              <Settings />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">设置</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            素材会经服务端转发上传到内网服务，这里配置它的地址。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-base-url">内网上传服务地址</Label>
            <Input
              id="upload-base-url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="http://10.75.202.161:8511"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                填完整根地址（含 http:// 和端口），上传接口路径由系统自动拼接。
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading || saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
