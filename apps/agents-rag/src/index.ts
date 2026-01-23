import { RagClient } from "@singulay/rag-sdk";

// Cloudflare Workers 的环境绑定：
// - VOLCENGINE_*：OpenAI Compatible 的模型/鉴权配置
// - RAG_VECTOR_STORE_KEY：向量库“文件名/Key”（在 DO Storage 中作为 key 使用）
// - VECTOR_STORE_DO：Durable Object（用于持久化向量库 JSON）
type Env = {
  VOLCENGINE_API_KEY?: string;
  VOLCENGINE_BASE_URL?: string;
  VOLCENGINE_CHAT_MODEL?: string;
  VOLCENGINE_EMBEDDING_MODEL?: string;
  RAG_VECTOR_STORE_KEY?: string;
  VECTOR_STORE_DO: DurableObjectNamespace;
};

// 仅用于本地兜底：如果没有绑定 Durable Object，就用内存 Map 存向量库
// - 部署到 Workers 时会走 DO，不会用到这个 Map
const memory = new Map<string, string>();

// 统一 JSON 响应 + CORS（方便浏览器/前端直接调用）
function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function isVolcengineBaseUrl(baseUrl: string) {
  return /volces\.com/i.test(baseUrl);
}

function looksLikeVolcengineEndpointId(model: string) {
  return typeof model === "string" && /^ep-[a-z0-9_-]+/i.test(model.trim());
}

function pickStatusFromErrorMessage(message: string) {
  if (/Embedding dimension mismatch:\s*store=\d+,\s*got=\d+/i.test(message)) return 409;
  if (/Embeddings request failed:\s*404/i.test(message)) return 400;
  if (/Chat request failed:\s*404/i.test(message)) return 400;
  if (/InvalidEndpointOrModel\.NotFound/i.test(message)) return 400;
  if (/Unauthorized|invalid api key|api key/i.test(message)) return 401;
  return 500;
}

function toMockStoreKey(baseKey: string) {
  const trimmed = String(baseKey ?? "").trim() || "vector_store.json";
  if (trimmed.endsWith(".mock.json")) return trimmed;
  if (trimmed.endsWith(".json")) return trimmed.replace(/\.json$/i, ".mock.json");
  return `${trimmed}.mock.json`;
}

function requireVolcengineConfig(params: {
  hasApiKey: boolean;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  needChat: boolean;
}) {
  if (!params.hasApiKey) {
    return {
      ok: false,
      status: 400,
      error:
        "缺少 VOLCENGINE_API_KEY（请用 wrangler secret 配置；或请求体加 mock: true 走 mock 模式）",
    };
  }

  if (isVolcengineBaseUrl(params.baseUrl)) {
    if (!looksLikeVolcengineEndpointId(params.embeddingModel)) {
      return {
        ok: false,
        status: 400,
        error:
          `VOLCENGINE_EMBEDDING_MODEL 配置无效（当前: ${JSON.stringify(
            params.embeddingModel,
          )}），火山方舟需要填 embedding 接入点 ID（例如 ep-xxxx）`,
      };
    }

    if (params.needChat && !looksLikeVolcengineEndpointId(params.chatModel)) {
      return {
        ok: false,
        status: 400,
        error:
          `VOLCENGINE_CHAT_MODEL 配置无效（当前: ${JSON.stringify(
            params.chatModel,
          )}），火山方舟需要填 chat 接入点 ID（例如 ep-xxxx）`,
      };
    }
  }

  return null;
}

// 允许请求体既支持 data: []，也支持单对象（会包一层数组）
function normalizeArrayInput(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  if (input == null) return [];
  return [input];
}

// 向量库存储适配层：把 RagClient 里的“读/写/删 store JSON”映射到 DO Storage
// - DO 内部真正持久化用的是 state.storage
// - 外部通过 stub.fetch 做 RPC（避免把 storage 逻辑散落在 handler 里）
function storage(env: Env) {
  if (env.VECTOR_STORE_DO) {
    const id = env.VECTOR_STORE_DO.idFromName("vector-store");
    const stub = env.VECTOR_STORE_DO.get(id);
    const toUrl = (key: string) =>
      `https://vector-store/${encodeURIComponent(key)}`;
    return {
      get: async (key: string) => {
        // GET -> 读取向量库 JSON（不存在返回 null）
        const res = await stub.fetch(toUrl(key), { method: "GET" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`store get failed: ${res.status}`);
        return await res.text();
      },
      put: async (key: string, value: string) => {
        // PUT -> 写入向量库 JSON（整份覆盖写）
        const res = await stub.fetch(toUrl(key), { method: "PUT", body: value });
        if (!res.ok) throw new Error(`store put failed: ${res.status}`);
      },
      delete: async (key: string) => {
        // DELETE -> 初始化时清空向量库
        const res = await stub.fetch(toUrl(key), { method: "DELETE" });
        if (!res.ok && res.status !== 404) {
          throw new Error(`store delete failed: ${res.status}`);
        }
      },
    };
  }
  return {
    get: async (key: string) => memory.get(key) ?? null,
    put: async (key: string, value: string) => {
      memory.set(key, value);
    },
    delete: async (key: string) => {
      memory.delete(key);
    },
  };
}

// 构造 RagClient（SDK 核心能力：embedding / ingest / retrieval / 可选 LLM 生成）
// 关键点：vectorStoreStorage 注入为 DO Storage，从而让 SDK 在 Workers 里可用
function buildClient(
  env: Env,
  opts: { mock?: boolean; vectorStoreKey?: string; mockEmbeddingDimension?: number } = {},
) {
  const pEnv = ((globalThis as any).process?.env ?? {}) as Record<string, string | undefined>;
  const read = (k: keyof Env | string) => (env as any)?.[k] ?? pEnv?.[String(k)];

  const apiKeyRaw = read("VOLCENGINE_API_KEY");
  const apiKey = apiKeyRaw ?? "your_api_key";
  const baseUrl = read("VOLCENGINE_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3";
  const chatModel = read("VOLCENGINE_CHAT_MODEL") ?? "gpt-4";
  const embeddingModel = read("VOLCENGINE_EMBEDDING_MODEL") ?? "embedding";
  const baseKey = read("RAG_VECTOR_STORE_KEY") ?? "vector_store.json";
  const key =
    (typeof opts.vectorStoreKey === "string" && opts.vectorStoreKey.trim()) ||
    (opts.mock ? toMockStoreKey(baseKey) : baseKey);
  const hasApiKey = Boolean(apiKeyRaw && apiKeyRaw.trim() && apiKeyRaw !== "your_api_key");

  return {
    client: new RagClient({
      apiKey,
      baseUrl,
      chatModel,
      embeddingModel,
      vectorStorePath: key,
      vectorStoreStorage: storage(env),
      mock: Boolean(opts.mock),
      mockEmbeddingDimension:
        typeof opts.mockEmbeddingDimension === "number" && Number.isFinite(opts.mockEmbeddingDimension)
          ? Math.max(1, Math.floor(opts.mockEmbeddingDimension))
          : undefined,
    }),
    key,
    baseKey,
    hasApiKey,
    baseUrl,
    chatModel,
    embeddingModel,
  };
}

// Workers Request body 读取工具：POST 体转 JSON
async function readJson(request: Request) {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 本项目的“数组灌库”实现：
// - 每条记录 JSON.stringify 成文本
// - 逐条调用 RagClient.ingestText（内部会 chunk -> embedding -> 写入 vector store）
async function ingestArray(client: RagClient, items: any[], meta: { source: string }) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = JSON.stringify(item);
    const topic = (item as any)?.topic;
    await client.ingestText(text, {
      source: meta.source,
      index: i,
      topic: typeof topic === "string" ? topic : undefined,
    });
  }
}

export default {
  // Workers 入口：路由分发 + 调用 RagClient 完成 init/append/query
  async fetch(request: Request, env: Env) {
    let activeVectorStoreKey: string | undefined;
    try {
      if (request.method === "OPTIONS") return json({ ok: true });

      const url = new URL(request.url);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/rag/health") {
        const { key, baseKey, hasApiKey, baseUrl, chatModel, embeddingModel } = buildClient(env);
        return json({
          ok: true,
          vectorStoreKeyBase: baseKey,
          vectorStoreKey: key,
          vectorStoreKeyMock: toMockStoreKey(baseKey),
          hasStorage: Boolean(env.VECTOR_STORE_DO),
          hasApiKey,
          baseUrl,
          chatModel,
          embeddingModel,
        });
      }

      if (request.method !== "POST")
        return json({ ok: false, error: "Method Not Allowed" }, { status: 405 });

      const body = (await readJson(request)) as any;
      const useMock = Boolean(body?.mock);
      const vectorStoreKeyOverride =
        typeof body?.vectorStoreKey === "string"
          ? body.vectorStoreKey
          : typeof body?.key === "string"
            ? body.key
            : undefined;
      const mockEmbeddingDimension =
        typeof body?.mockEmbeddingDimension === "number" ? body.mockEmbeddingDimension : undefined;

      const { client, key, hasApiKey, baseUrl, chatModel, embeddingModel } = buildClient(env, {
        mock: useMock,
        vectorStoreKey: vectorStoreKeyOverride,
        mockEmbeddingDimension,
      });
      activeVectorStoreKey = key;

      if (pathname === "/rag/init") {
        if (!useMock) {
          const err = requireVolcengineConfig({
            hasApiKey,
            baseUrl,
            chatModel,
            embeddingModel,
            needChat: false,
          });
          if (err) return json({ ok: false, error: err.error }, { status: err.status });
        }
        await storage(env).delete(client.getStorePath());
        const items = normalizeArrayInput(body?.data ?? body?.documents);
        await ingestArray(client, items, { source: "init" });
        return json({ ok: true, count: items.length, vectorStoreKey: key });
      }

      if (pathname === "/rag/append") {
        if (!useMock) {
          const err = requireVolcengineConfig({
            hasApiKey,
            baseUrl,
            chatModel,
            embeddingModel,
            needChat: false,
          });
          if (err) return json({ ok: false, error: err.error }, { status: err.status });
        }
        const items = normalizeArrayInput(body?.data ?? body?.documents);
        await ingestArray(client, items, { source: "append" });
        return json({ ok: true, count: items.length });
      }

      if (pathname === "/rag/query" || pathname === "/rag/ask") {
        const question = String(body?.question ?? body?.query ?? "");

        const rawConfig = (body?.config ?? body ?? {}) as Record<string, any>;
        const config: Record<string, any> = { ...rawConfig };
        delete config.question;
        delete config.query;

        const rawAnswerMode = config.answerMode;
        if (rawAnswerMode === "documents") config.answerMode = "none";
        if (rawAnswerMode === "answer") config.answerMode = "llm";
        if (typeof config.topK === "number" && Number.isFinite(config.topK)) {
          const k = Math.max(1, Math.floor(config.topK));
          if (config.semanticTopK == null) config.semanticTopK = k;
          if (config.keywordTopK == null) config.keywordTopK = k;
          if (config.hybridTopK == null) config.hybridTopK = k;
          delete config.topK;
        }

        if (!useMock) {
          const needChat = (config.answerMode ?? "llm") === "llm";
          const err = requireVolcengineConfig({
            hasApiKey,
            baseUrl,
            chatModel,
            embeddingModel,
            needChat,
          });
          if (err) return json({ ok: false, error: err.error }, { status: err.status });
        }

        const result = await client.query(question, config);

        if (result.usedConfig.answerMode === "none") return json(result.documents);
        if (typeof result.answer === "string" && result.answer) return json([result.answer]);
        if (Array.isArray(result.documents) && result.documents.length) return json(result.documents);
        return json([]);
      }

      return json({ ok: false, error: "Not Found" }, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = pickStatusFromErrorMessage(message);
      const dimMatch = message.match(/Embedding dimension mismatch:\s*store=(\d+),\s*got=(\d+)/i);
      const hint =
        dimMatch
          ? `向量库 key=${JSON.stringify(
              activeVectorStoreKey ?? "",
            )} 的向量维度为 ${dimMatch[1]}，但当前 embedding 输出维度为 ${dimMatch[2]}。` +
            `请用真实模式重新 /rag/init 重建该 key 的向量库，或使用不同的 vectorStoreKey（mock 默认会使用 *.mock.json 避免污染）。`
          : undefined;
      return json(
        { ok: false, error: message, vectorStoreKey: activeVectorStoreKey, hint },
        { status },
      );
    }
  },
};

// Durable Object：用 state.storage 持久化“向量库 JSON”（key -> json string）
// 说明：这里存的是 SDK 的 JsonVectorStore（version/dimension/items...）序列化结果
export class VectorStoreDO implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!key) return new Response("missing key", { status: 400 });

    if (request.method === "GET") {
      // 返回 raw JSON 字符串（由上层 storage(env).get 使用）
      const v = await this.state.storage.get<string>(key);
      if (typeof v !== "string") return new Response("", { status: 404 });
      return new Response(v, { status: 200 });
    }

    if (request.method === "PUT") {
      // 直接覆盖写入整份向量库 JSON
      const v = await request.text();
      await this.state.storage.put(key, v);
      return new Response("", { status: 204 });
    }

    if (request.method === "DELETE") {
      // 删除整份向量库 JSON（用于 init 前清空）
      await this.state.storage.delete(key);
      return new Response("", { status: 204 });
    }

    return new Response("method not allowed", { status: 405 });
  }
}
