# agents-rag（Workers RAG API）

这是一个 Cloudflare Workers 服务，把 `@singulay/rag-sdk` 的 `RagClient` 封装成一组 HTTP 接口，提供：

- 向量库初始化（全量重建）
- 向量库追加写入
- 检索查询（返回检索文档或回答）

向量库存储不落本地文件，默认通过 Durable Object 的 `state.storage` 持久化一份向量库 JSON（等价于把 `vector_store.json` 存到 DO 里）。

入口实现见 [src/index.ts](file:///Users/ashy/Documents/code/mastra-rag-demo/apps/agents-rag/src/index.ts)。

## 接口约定

- 请求/响应均为 JSON
- 已开启 CORS（`access-control-allow-origin: *`）
- 查询接口支持 `answerMode`：
  - `answerMode: "none"`：返回 `documents[]`
  - 其它（如 `"extractive"` / `"llm"`）：返回 `[answer]`（数组里只有一条字符串）

## Base URL

- 本地开发：`http://localhost:8787`
- 线上（示例）：`https://agents-rag.zengjx1998.workers.dev`
- 服务器端（生产）：`https://rag-api.rowlandw3ai.shop`

## GET /rag/health

用于健康检查与确认存储绑定是否存在。

**Response**

```json
{
  "ok": true,
  "vectorStoreKey": "vector_store.json",
  "hasStorage": true
}
```

## POST /rag/init

初始化（重建）向量库：

- 先删除当前向量库（同一个 `vectorStoreKey`）
- 再把 `data[]` 逐条写入向量库

**Request**  

```json
{
  "data": [
    { "topic": "香蕉", "description": "香蕉口感软糯" },
    { "topic": "梨子", "description": "梨子水分含量高" }
  ]
}
```

**Response**  

```json
{
  "ok": true,
  "count": 2,
  "vectorStoreKey": "vector_store.json"
}
```

## POST /rag/append

向量库追加写入（不删除已有内容），把 `data[]` 逐条写入向量库。

**Request**  

```json
{
  "data": [
    { "topic": "草莓", "description": "草莓香甜多汁" }
  ]
}
```

**Response**  

```json
{
  "ok": true,
  "count": 1
}
```

## POST /rag/query

检索查询接口。

**Request**  

```json
{
  "question": "香蕉是什么？",
  "config": {
    "answerMode": "none",
    "similarityThreshold": 0.35,
    "semanticTopK": 8,
    "keywordTopK": 8,
    "hybridTopK": 6,
    "strict": false,
    "temperature": 0.7
  }
}
```

**Response（answerMode = "none"）**  

```json
[
  {
    "id": "972c64d0-003b-4784-9d8c-2b9ebb38837e",
    "text": "{\"topic\":\"香蕉\",\"description\":\"香蕉口感软糯\"}",
    "metadata": { "source": "init", "index": 0, "topic": "香蕉" },
    "semanticScore": 0.01,
    "keywordScore": 0.25,
    "score": 0.06
  }
]
```

**Response（answerMode = "extractive" / "llm"）**  

```json
[
  "推荐：香蕉\n\n理由：香蕉口感软糯"
]
```

## POST /rag/ask

与 `/rag/query` 等价，仅命名更偏“问答”。

## 配置（环境变量 / wrangler vars & secrets）

在 [wrangler.toml](file:///Users/ashy/Documents/code/mastra-rag-demo/apps/agents-rag/wrangler.toml) 中使用变量：

- `VOLCENGINE_BASE_URL`：OpenAI Compatible Base URL（默认火山 Ark v3）
- `VOLCENGINE_CHAT_MODEL`：聊天模型
- `VOLCENGINE_EMBEDDING_MODEL`：embedding 模型
- `RAG_VECTOR_STORE_KEY`：向量库 key（默认 `vector_store.json`）

建议用 secret 配置：

- `VOLCENGINE_API_KEY`：鉴权 key（不建议写进 vars）

示例（命令行）：

```bash
npx wrangler secret put VOLCENGINE_API_KEY
```

## 本地开发

```bash
npm -w apps/agents-rag run dev -- --local --port 8787
```

然后访问：

- `GET http://localhost:8787/rag/health`
- `POST http://localhost:8787/rag/init`
- `POST http://localhost:8787/rag/append`
- `POST http://localhost:8787/rag/query`

## 部署

```bash
npm -w apps/agents-rag run deploy
```

## 持久化说明

- 本项目用 Durable Object `VectorStoreDO` 持久化向量库 JSON（一个 key 对应一份 JSON 字符串）
- SDK 每次 `ingestText/query` 会通过 `vectorStoreStorage` 读取/写入这份 JSON
