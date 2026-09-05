"use client";

import { type AppSettings, llmEndpointSchema } from "@aigc-flow/shared";
import { ListChecks, Loader2, PlugZap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SettingsField } from "@/components/settings-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

type LlmValues = Pick<AppSettings, "llmBaseUrl" | "llmApiKey" | "llmModel">;

/**
 * 探测结果只留一条：两个按钮打的是同一条链路，各留各的只会互相盖，
 * 用户也分不清屏幕上那两行说的是不是同一次操作。
 */
type Probe = { ok: boolean; message: string };

/**
 * 用户自己点的「取消」不是故障，按 ok 记 —— 红字是留给真出问题的时候的，
 * 见得多了就没人看了。
 */
function abortedProbe(controller: AbortController): Probe | null {
  return controller.signal.aborted ? { ok: true, message: "已取消" } : null;
}

/**
 * LLM 分区。地址和 Key 都随手就能测：两个按钮把**当前输入框里的值**发给服务端，
 * 不要求先保存 —— 填错了先存下来再回来改，是最难用的一种顺序。
 */
export function SettingsLlmSection({
  values,
  apiKeyPreview,
  disabled,
  error,
  onChange,
}: {
  values: LlmValues;
  /** 已存 Key 的掩码，真 Key 不出服务端 */
  apiKeyPreview: string;
  disabled: boolean;
  error: { field: string; message: string } | null;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  /** 从 /models 拉回来的列表。空 = 还没查过，或者这个服务压根没实现 */
  const [models, setModels] = useState<string[]>([]);
  /** 拉到列表之后仍想手填（服务返回的列表不全、或要用别名） */
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState<"models" | "verify" | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  /** 已等待的秒数。最小验证可能要等模型冷启动，没有任何动静的按钮看着就像卡死了 */
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // 关面板 = 卸载本组件。请求还挂着的话结果没人收，早点掐断
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * 「取消」只掐断浏览器到本服务这一段：服务端发往 LLM 的那次请求还会跑到它自己超时。
   * 无所谓 —— 那只是一条 16 token 的 ping，没有副作用，也不记流水。
   */
  const handleCancel = () => abortRef.current?.abort();

  const useSelect = models.length > 0 && !manual;
  /** 已选的模型可能不在列表里（手填的、或列表没覆盖到），并进去才不会显示成空 */
  const options = useMemo(
    () =>
      [...new Set([...models, values.llmModel].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [models, values.llmModel],
  );

  /** 两个按钮都得先拿到一个合法地址，不合法就地报，别白发一次请求 */
  const baseUrlOf = (): string | null => {
    const parsed = llmEndpointSchema.safeParse(values.llmBaseUrl);
    if (parsed.success) return parsed.data;
    setProbe({ ok: false, message: "请先填写正确的接口地址（http(s) 开头）" });
    return null;
  };

  /** 失败响应的形状和其他接口一致：{ message } */
  const failureOf = async (res: Response): Promise<string> => {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return body?.message ?? `请求失败（${res.status}）`;
  };

  const handleCheckModels = async () => {
    const baseUrl = baseUrlOf();
    if (!baseUrl) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("models");
    setProbe(null);
    try {
      // apiKey 传输入框里的值：留空时服务端自动用已存的那份（面板里只有掩码）
      const res = await api.api.llm.models.$post(
        { json: { baseUrl, apiKey: values.llmApiKey } },
        { init: { signal: controller.signal } },
      );
      if (!res.ok) {
        setProbe({ ok: false, message: await failureOf(res) });
        return;
      }

      const { models: list } = (await res.json()) as { models: string[] };
      setModels(list);
      setManual(false);
      // 换了服务商时旧模型名多半已经无效，顺手落到列表第一个，省得存下一个用不了的名字
      if (!list.includes(values.llmModel)) onChange({ llmModel: list[0] ?? "" });
      setProbe({ ok: true, message: `读到 ${list.length} 个模型` });
    } catch {
      setProbe(
        abortedProbe(controller) ?? { ok: false, message: "连不上服务，确认 server 已启动" },
      );
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    const baseUrl = baseUrlOf();
    if (!baseUrl) return;
    if (!values.llmModel) {
      setProbe({ ok: false, message: "请先填写或选择模型" });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("verify");
    setProbe(null);
    try {
      const res = await api.api.llm.verify.$post(
        { json: { baseUrl, apiKey: values.llmApiKey, model: values.llmModel } },
        { init: { signal: controller.signal } },
      );
      if (!res.ok) {
        setProbe({ ok: false, message: await failureOf(res) });
        return;
      }

      const { model, reply } = (await res.json()) as { model: string; reply: string };
      setProbe({
        ok: true,
        // 回复为空不算失败：推理模型会把这点额度全花在思考上，链路本身是通的
        message: reply ? `已连通，${model} 回了「${reply}」` : `已连通，${model} 接受了请求`,
      });
    } catch {
      setProbe(
        abortedProbe(controller) ?? { ok: false, message: "连不上服务，确认 server 已启动" },
      );
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };

  const errorOf = (field: keyof LlmValues) => (error?.field === field ? error.message : undefined);

  return (
    <div className="space-y-4">
      <SettingsField
        id="setting-llmBaseUrl"
        label="接口地址（OpenAI 协议）"
        error={errorOf("llmBaseUrl")}
        hint="填到版本段为止（多数是 /v1），后面的 /models 和 /chat/completions 由程序拼。留空表示不启用。"
      >
        <Input
          id="setting-llmBaseUrl"
          value={values.llmBaseUrl}
          onChange={(event) => onChange({ llmBaseUrl: event.target.value })}
          placeholder="https://api.openai.com/v1"
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </SettingsField>

      <SettingsField
        id="setting-llmApiKey"
        label="API Key"
        error={errorOf("llmApiKey")}
        hint={
          apiKeyPreview
            ? `已配置 ${apiKeyPreview}。留空 = 不改动；要换就直接填新的。`
            : "本地部署的服务（ollama / vLLM）通常不校验，可以留空。"
        }
      >
        {/*
          遮起来但要挡住密码管理器：type="password" 一出现，1Password / LastPass 之类
          就会往这个框上弹自动填充，甚至真往里塞一条用户的密码 —— 这里要的是 API Key，
          不是登录凭据。autoComplete="off" 对它们不管用，得按各家的忽略属性来。
        */}
        <Input
          id="setting-llmApiKey"
          type="password"
          value={values.llmApiKey}
          onChange={(event) => onChange({ llmApiKey: event.target.value })}
          placeholder={apiKeyPreview ? "留空则沿用已配置的 Key" : "sk-…"}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
        />
      </SettingsField>

      <SettingsField
        id="setting-llmModel"
        label="模型"
        error={errorOf("llmModel")}
        hint={
          useSelect ? (
            <>
              列表来自这个地址的 /models。
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setManual(true)}
              >
                改成手动填写
              </button>
            </>
          ) : (
            "点右边「检查模型」从地址拉可选列表；服务没实现 /models 时手填模型名也能用。"
          )
        }
      >
        <div className="flex gap-2">
          {useSelect ? (
            <Select
              value={values.llmModel}
              onValueChange={(value) => onChange({ llmModel: value })}
              disabled={disabled}
            >
              <SelectTrigger id="setting-llmModel" className="flex-1">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {options.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="setting-llmModel"
              className="flex-1"
              value={values.llmModel}
              onChange={(event) => onChange({ llmModel: event.target.value })}
              placeholder="gpt-4o-mini"
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleCheckModels}
            disabled={disabled || busy !== null}
          >
            {busy === "models" ? <Loader2 className="animate-spin" /> : <ListChecks />}
            检查模型
          </Button>
        </div>
      </SettingsField>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleVerify}
            disabled={disabled || busy !== null}
          >
            {busy === "verify" ? <Loader2 className="animate-spin" /> : <PlugZap />}
            发送最小验证请求
          </Button>
          {/* 等待中把秒数摆出来并留一个出口：模型冷启动能拖到一分钟以上，
              一个不动的按钮和一个卡死的界面，用户是分不出来的 */}
          {busy ? (
            <>
              <p className="text-muted-foreground text-sm">已等待 {elapsed} 秒…</p>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                取消
              </Button>
            </>
          ) : (
            probe && (
              <p className={probe.ok ? "text-sm" : "text-destructive text-sm"}>{probe.message}</p>
            )
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          用当前填的地址、Key 和模型打一条 max_tokens=16 的 ping，一次证明三样都对。
          结果不入库，也不算生成流水。
        </p>
      </div>
    </div>
  );
}
