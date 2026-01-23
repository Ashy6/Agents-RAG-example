# agents-rag（Workers RAG API）

这是一个 Cloudflare Workers 服务，把 `@singulay/rag-sdk` 的 `RagClient` 封装成一组 HTTP 接口，提供：

- 向量库初始化（全量重建）
- 向量库追加写入
- 检索查询（返回检索文档或回答）

向量库存储不落本地文件，默认通过 Durable Object 的 `state.storage` 持久化一份向量库 JSON（等价于把 `vector_store.json` 存到 DO 里）。

入口实现见 [src/index.ts](src/index.ts)。

## 接口约定

- 请求/响应均为 JSON（响应 `content-type: application/json; charset=utf-8`）
- 已开启 CORS（`access-control-allow-origin: *`，允许 `GET,POST,OPTIONS`）
- 预检：任意路径 `OPTIONS` 返回 `{ "ok": true }`
- `/rag/init`、`/rag/append` 的入库数据支持两种写法：
  - `data: [...]` 或 `documents: [...]`
  - 也支持单对象（后端会自动包一层数组）
- `/rag/query`、`/rag/ask` 支持两种问题字段：`question` 或 `query`
- 查询接口 `answerMode` 约定：
  - `answerMode: "none"`：返回 `documents[]`
  - `answerMode: "llm"`（默认）或其它值：优先返回 `[answer]`（数组里只有一条字符串）；若没有 answer 则返回 `documents[]` 或 `[]`
- `answerMode` 兼容别名（便于前端统一约定）：
  - `answerMode: "documents"`：等价于 `"none"`
  - `answerMode: "answer"`：等价于 `"llm"`
- `topK` 兼容：如请求里传了 `topK`，后端会把它展开为 `semanticTopK/keywordTopK/hybridTopK`（缺省项才会填充）

## 错误响应

除 `GET /rag/health` 外，其它接口在异常时统一返回：

```json
{
  "ok": false,
  "error": "错误信息字符串",
  "vectorStoreKey": "vector_store.json",
  "hint": "可选：诊断/修复提示"
}
```

常见 HTTP 状态码：

- `400`：请求参数不合法；模型/接入点不存在；OpenAI Compatible 返回 404 等
- `401`：鉴权失败（如 API Key 不正确/缺失且未开启 mock）
- `409`：向量维度不匹配（同一个向量库 key 写入过不同 embedding 维度的数据）
- `500`：其它未分类错误

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
  "vectorStoreKeyBase": "vector_store.json",
  "vectorStoreKey": "vector_store.json",
  "vectorStoreKeyMock": "vector_store.mock.json",
  "hasStorage": true,
  "hasApiKey": true,
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "chatModel": "ep-xxxx",
  "embeddingModel": "ep-xxxx"
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
  ],
  "vectorStoreKey": "vector_store.json",
  "mock": false
}
```

也支持 `documents` 字段与“单对象”写法（后端会当成数组长度 1）：

```json
{
  "documents": { "topic": "香蕉", "description": "香蕉口感软糯" }
}
```

请求字段说明：

- `data` / `documents`：待入库的 JSON 对象数组（或单对象）；后端会对每条记录执行 `JSON.stringify` 后入库
- `vectorStoreKey` / `key`：可选，覆盖默认向量库 key（用于多租户/多环境隔离）
- `mock`：可选，`true` 走 mock 模式（不需要 VOLCENGINE_API_KEY；默认会写入 `*.mock.json` 避免污染真实库）
- `mockEmbeddingDimension`：可选，仅在 `mock: true` 时生效，指定 mock embedding 维度（用于复现/规避维度不匹配问题）

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
  ],
  "vectorStoreKey": "vector_store.json",
  "mock": false
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
  "vectorStoreKey": "vector_store.json",
  "mock": false,
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

也支持把参数放到顶层，以及把 `question` 写成 `query`（更贴近某些前端习惯）：

```json
{
  "query": "香蕉是什么？",
  "answerMode": "documents",
  "topK": 5
}
```

请求字段说明：

- `question` / `query`：必填，问题文本
- `config`：可选，透传给 SDK 的查询配置；也支持把配置字段直接放到顶层（后端会自动合并）
- `answerMode`：可选，见“接口约定”，缺省等价于 `"llm"`（会触发 chat 模型调用）
- `topK`：可选，兼容字段，会展开到 `semanticTopK/keywordTopK/hybridTopK`
- `vectorStoreKey` / `key`：可选，覆盖默认向量库 key
- `mock`：可选，`true` 走 mock 模式（无须 VOLCENGINE_API_KEY）
- `mockEmbeddingDimension`：可选，仅 `mock: true` 生效

响应说明：

- `answerMode = "none"`：直接返回 `documents[]`
- `answerMode != "none"`：优先返回 `[answer]`；无 answer 时返回 `documents[]` 或 `[]`

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

在 [wrangler.toml](wrangler.toml) 中使用变量：

- `VOLCENGINE_BASE_URL`：OpenAI Compatible Base URL（默认火山 Ark v3）
- `VOLCENGINE_CHAT_MODEL`：聊天模型
- `VOLCENGINE_EMBEDDING_MODEL`：embedding 模型
- `RAG_VECTOR_STORE_KEY`：向量库 key（默认 `vector_store.json`）
- `VECTOR_STORE_DO`：Workers 环境绑定的 Durable Object Namespace（用于持久化向量库；未绑定时本地会退化为内存 Map）

火山方舟（`VOLCENGINE_BASE_URL` 包含 `volces.com`）会额外做配置校验：

- `VOLCENGINE_EMBEDDING_MODEL` 必须是 embedding 接入点 ID（形如 `ep-xxxx`）
- 当查询需要生成回答（`answerMode = "llm"`，默认）时，`VOLCENGINE_CHAT_MODEL` 也必须是 chat 接入点 ID（形如 `ep-xxxx`）

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
