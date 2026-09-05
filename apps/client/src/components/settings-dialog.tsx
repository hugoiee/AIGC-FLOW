"use client";

import { type AppSettings, appSettingsSchema, DEFAULT_APP_SETTINGS } from "@aigc-flow/shared";
import { Bot, Server, Settings } from "lucide-react";
import { type FormEvent, useState } from "react";
import { SettingsField } from "@/components/settings-field";
import { SettingsLlmSection } from "@/components/settings-llm-section";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";

/** 面板持有的形状：设置本体 + 只读的 Key 掩码（服务端算好给的，不参与保存） */
type SettingsForm = AppSettings & { llmApiKeyPreview: string };

const EMPTY_FORM: SettingsForm = { ...DEFAULT_APP_SETTINGS, llmApiKeyPreview: "" };

/** 内网服务分类下的四个纯文本设置项，新增同类项在这里加一行 */
const SERVICE_FIELDS: Array<{
  key: keyof AppSettings;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    key: "imageUploadUrl",
    label: "图像 / 视频上传接口",
    placeholder: "http://<内网主机>:<端口>/api/upload",
    hint: "图片和视频素材经服务端转发上传到这里，填完整接口地址。",
  },
  {
    key: "audioUploadUrl",
    label: "音频上传接口",
    placeholder: "http://<内网主机>:<端口>/api/upload-media",
    hint: "音频素材的上传接口，填完整接口地址。",
  },
  {
    key: "generateUrl",
    label: "AIGC 生成接口",
    placeholder: "http://<内网主机>:<端口>/aigc",
    hint: "图像 / 视频生成（/aigc）走这里，注意端口和上传不同。",
  },
  {
    key: "reqFrom",
    label: "请求来源标识（req_from）",
    placeholder: "v_zhangsan",
    hint: "上传和生成接口都要求携带的个人标识，不填两边都用不了。",
  },
];

/** 字段归属哪个分类。校验失败时要跳到对应分类，否则错误提示藏在没显示的那栏里 */
const SECTION_OF_FIELD: Partial<Record<string, string>> = {
  llmBaseUrl: "llm",
  llmApiKey: "llm",
  llmModel: "llm",
};

/**
 * 全局设置面板。配置存在服务端 settings 表里，所有浏览器共享同一份。
 * 左栏选分类、右栏是设置项：分类多起来之后一长条竖排要滚很久才找得到。
 */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("service");
  const [values, setValues] = useState<SettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 校验失败时定位到具体字段；网络类错误挂在 form 上 */
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const patch = (next: Partial<AppSettings>) => setValues((current) => ({ ...current, ...next }));

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setError(null);
    if (!next) return;

    setLoading(true);
    api.api.settings
      .$get()
      .then((res) => res.json())
      .then((data) => setValues(data))
      .catch(() => setError({ field: "form", message: "读取设置失败，确认 server 已启动" }))
      .finally(() => setLoading(false));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // 校验用的是和服务端同一份 shared schema，两边判断永远一致。
    // 多出来的 llmApiKeyPreview 会被 zod 直接 strip 掉，不会发出去
    const parsed = appSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? "form");
      setError({ field, message: issue?.message ?? "输入不正确" });
      setSection(SECTION_OF_FIELD[field] ?? "service");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await api.api.settings.$put({ json: parsed.data });
      if (!res.ok) {
        setError({ field: "form", message: "保存失败，请检查输入" });
        return;
      }
      // 用回存后的视图刷新本地：Key 会被换成新的掩码，输入框回到空
      setValues(await res.json());
      setOpen(false);
    } catch {
      setError({ field: "form", message: "连不上服务，确认 server 已启动" });
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

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>外部服务的连接配置，保存在服务端，所有人共享。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs
            value={section}
            onValueChange={setSection}
            orientation="vertical"
            className="items-stretch gap-6"
          >
            <TabsList variant="line" className="w-36 shrink-0 gap-1">
              <TabsTrigger value="service" className="w-full justify-start">
                <Server />
                内网服务
              </TabsTrigger>
              <TabsTrigger value="llm" className="w-full justify-start">
                <Bot />
                LLM 模型
              </TabsTrigger>
            </TabsList>

            {/* 右栏有可能比左栏高，自己滚，不要把整个弹层撑出屏幕 */}
            <div className="max-h-[60vh] min-w-0 flex-1 overflow-y-auto pr-1">
              {/*
                forceMount：Radix 默认卸载未选中的分类，LLM 那栏一卸载，
                刚查出来的模型列表就没了 —— 切回来又得重查一次。
                但 forceMount 下 Radix 认定内容「在场」，**不会再加 hidden**，
                只留一个 data-state="inactive" ——两栏内容会直接叠着一起显示。
                隐藏得自己按这个属性来做。
              */}
              <TabsContent
                value="service"
                forceMount
                className="space-y-4 data-[state=inactive]:hidden"
              >
                {SERVICE_FIELDS.map(({ key, label, placeholder, hint }) => (
                  <SettingsField
                    key={key}
                    id={`setting-${key}`}
                    label={label}
                    hint={hint}
                    error={error?.field === key ? error.message : undefined}
                  >
                    <Input
                      id={`setting-${key}`}
                      value={values[key]}
                      onChange={(event) => patch({ [key]: event.target.value })}
                      placeholder={placeholder}
                      disabled={loading}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </SettingsField>
                ))}
              </TabsContent>

              <TabsContent value="llm" forceMount className="data-[state=inactive]:hidden">
                <SettingsLlmSection
                  values={values}
                  apiKeyPreview={values.llmApiKeyPreview}
                  disabled={loading}
                  error={error}
                  onChange={patch}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="items-center gap-3 pt-6">
            {error?.field === "form" && <p className="text-destructive text-sm">{error.message}</p>}
            <Button type="submit" disabled={loading || saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
