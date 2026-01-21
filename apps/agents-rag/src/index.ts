import { RagClient } from "@singulay/rag-sdk";

type Env = {
  VOLCENGINE_API_KEY?: string;
  VOLCENGINE_BASE_URL?: string;
  VOLCENGINE_CHAT_MODEL?: string;
  VOLCENGINE_EMBEDDING_MODEL?: string;
  RAG_VECTOR_STORE_KEY?: string;
  VECTOR_STORE_DO: DurableObjectNamespace;
};

const memory = new Map<string, string>();

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function normalizeArrayInput(input: unknown): any[] {
  if (Array.isArray(input)) return input;
  if (input == null) return [];
  return [input];
}

function storage(env: Env) {
  if (env.VECTOR_STORE_DO) {
    const id = env.VECTOR_STORE_DO.idFromName("vector-store");
    const stub = env.VECTOR_STORE_DO.get(id);
    const toUrl = (key: string) =>
      `https://vector-store/${encodeURIComponent(key)}`;
    return {
      get: async (key: string) => {
        const res = await stub.fetch(toUrl(key), { method: "GET" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`store get failed: ${res.status}`);
        return await res.text();
      },
      put: async (key: string, value: string) => {
        const res = await stub.fetch(toUrl(key), { method: "PUT", body: value });
        if (!res.ok) throw new Error(`store put failed: ${res.status}`);
      },
      delete: async (key: string) => {
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

function buildClient(env: Env) {
  const apiKey = env.VOLCENGINE_API_KEY ?? "your_api_key";
  const baseUrl = env.VOLCENGINE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const chatModel = env.VOLCENGINE_CHAT_MODEL ?? "gpt-4";
  const embeddingModel = env.VOLCENGINE_EMBEDDING_MODEL ?? "embedding";
  const key = env.RAG_VECTOR_STORE_KEY ?? "vector_store.json";

  return {
    client: new RagClient({
      apiKey,
      baseUrl,
      chatModel,
      embeddingModel,
      vectorStorePath: key,
      vectorStoreStorage: storage(env),
    }),
    key,
  };
}

async function readJson(request: Request) {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") return json({ ok: true });

    const url = new URL(request.url);
    const pathname = url.pathname;
    const { client, key } = buildClient(env);

    if (request.method === "GET" && pathname === "/rag/health") {
      return json({ ok: true, vectorStoreKey: key, hasStorage: Boolean(env.VECTOR_STORE_DO) });
    }

    if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, { status: 405 });

    const body = (await readJson(request)) as any;

    if (pathname === "/rag/init") {
      await storage(env).delete(key);
      const items = normalizeArrayInput(body?.data);
      await ingestArray(client, items, { source: "init" });
      return json({ ok: true, count: items.length, vectorStoreKey: key });
    }

    if (pathname === "/rag/append") {
      const items = normalizeArrayInput(body?.data);
      await ingestArray(client, items, { source: "append" });
      return json({ ok: true, count: items.length });
    }

    if (pathname === "/rag/query" || pathname === "/rag/ask") {
      const question = String(body?.question ?? "");
      const config = (body?.config ?? {}) as Record<string, any>;
      const result = await client.query(question, config);
      if (result.usedConfig.answerMode === "none") return json(result.documents);
      if (typeof result.answer === "string" && result.answer) return json([result.answer]);
      return json([]);
    }

    return json({ ok: false, error: "Not Found" }, { status: 404 });
  },
};

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
      const v = await this.state.storage.get<string>(key);
      if (typeof v !== "string") return new Response("", { status: 404 });
      return new Response(v, { status: 200 });
    }

    if (request.method === "PUT") {
      const v = await request.text();
      await this.state.storage.put(key, v);
      return new Response("", { status: 204 });
    }

    if (request.method === "DELETE") {
      await this.state.storage.delete(key);
      return new Response("", { status: 204 });
    }

    return new Response("method not allowed", { status: 405 });
  }
}
