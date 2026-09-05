import {
  llmChatEndpoint,
  llmModelsEndpoint,
  llmProbeRequestSchema,
  llmVerifyRequestSchema,
} from "@aigc-flow/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { apiKeyOf, failureMessageOf, headersOf, replyTextOf, upstreamErrorOf } from "../lib/llm";
import { snippet } from "../lib/upstream";

/** 列模型是纯读操作，几百毫秒就该回来；卡住多半是地址指错了 */
const MODELS_TIMEOUT_MS = 15_000;
/**
 * 最小验证要等模型真吐字，给得比列模型宽得多：本地服务（vLLM / ollama）
 * 首次请求要把权重加载进显存，7B 就常见 30-90 秒。卡在这里报超时是**假阴性** ——
 * 配置其实是对的，用户却会掉头去改一个没问题的地址。宁可等久一点，
 * 面板那边有秒数和「取消」兜着，不会让人以为界面死了。
 */
const VERIFY_TIMEOUT_MS = 120_000;

/**
 * 最小验证请求发出的 token 上限。刻意压到很小：这一步只证明
 * 「地址通 + 鉴权过 + 模型名有效」，不是要看模型答得好不好。
 * 也刻意不带 temperature —— 部分推理模型只接受默认值，带上反而被拒。
 */
const VERIFY_MAX_TOKENS = 16;

/** `/models` 的返回是 `{ data: [{ id }] }`，只取 id */
function modelIdsOf(body: unknown): string[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const ids = data
    .map((item) => (item as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export const llmRoute = new Hono()
  /** 列出这个地址支持的模型。地址和 key 从入参来，支持「还没保存就先测」 */
  .post("/models", zValidator("json", llmProbeRequestSchema), async (c) => {
    const { baseUrl, apiKey } = c.req.valid("json");

    let res: Response;
    try {
      res = await fetch(llmModelsEndpoint(baseUrl), {
        headers: headersOf(apiKeyOf(apiKey)),
        signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      });
    } catch (error) {
      return c.json({ message: failureMessageOf(error, "读取模型列表", MODELS_TIMEOUT_MS) }, 502);
    }

    if (!res.ok) return c.json({ message: await upstreamErrorOf(res) }, 502);

    const models = modelIdsOf(await res.json().catch(() => null));
    if (models.length === 0) {
      // 连上了但列表是空的：多半是地址少了 /v1 之类的版本段，打在了别的接口上
      return c.json({ message: "地址能通，但没读到任何模型。确认地址填到了 /v1 这一段" }, 502);
    }
    return c.json({ models });
  })
  /** 最小请求验证：真打一次 chat/completions，证明整条链路可用 */
  .post("/verify", zValidator("json", llmVerifyRequestSchema), async (c) => {
    const { baseUrl, apiKey, model } = c.req.valid("json");

    let res: Response;
    try {
      res = await fetch(llmChatEndpoint(baseUrl), {
        method: "POST",
        headers: headersOf(apiKeyOf(apiKey)),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: VERIFY_MAX_TOKENS,
          stream: false,
        }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
    } catch (error) {
      return c.json({ message: failureMessageOf(error, "验证请求", VERIFY_TIMEOUT_MS) }, 502);
    }

    if (!res.ok) return c.json({ message: await upstreamErrorOf(res) }, 502);

    const body = await res.json().catch(() => null);
    const reply = replyTextOf(body);
    // 有的服务会把真正命中的模型名回在 body.model 上（别名 / 路由到具体版本），有就用它
    const echoed = (body as { model?: unknown })?.model;
    // 回复为空不算失败：推理模型会把这 16 个 token 全花在思考上，
    // 但请求本身走通了 —— 报成失败会让用户白白去改配置
    return c.json({
      model: typeof echoed === "string" && echoed ? echoed : model,
      reply: snippet(reply, 120),
    });
  });
