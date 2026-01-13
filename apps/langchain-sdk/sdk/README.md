# rag（本地 JSON 向量库 + OpenAI Compatible）

这个 SDK 提供一个轻量的 RAG 能力：

- 把任意文本切片后做 embedding，追加写入本地 JSON 向量库文件
- 对问题做 embedding，在向量库里混合（语义 + 关键词）检索
- 可选：用大模型基于检索上下文生成回答；或不调用模型直接返回“抽取式”回答

## 安装与构建

在仓库内以本地依赖方式使用（本项目示例就是这样做的）：

```bash
cd /Users/ashy/Documents/code/mastra-rag-demo/apps/langchain-sdk/sdk
npm install --workspaces=false
npm run build
```

## 环境变量

SDK 本身不会自动读取 `.env`，建议在你的应用入口处自行加载：

```bash
# /Users/ashy/Documents/code/mastra-rag-demo/apps/langchain-sdk/.env（示例）
VOLCENGINE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_CHAT_MODEL=ep-xxxxxxxxxxxxxxxxx
VOLCENGINE_EMBEDDING_MODEL=ep-xxxxxxxxxxxxxxxxx
```

## 快速上手（Node 脚本）

```js
import dotenv from "dotenv";
import path from "path";
import { RagClient } from "rag";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const client = new RagClient({
  apiKey: process.env.VOLCENGINE_API_KEY ?? "your_api_key",
  baseUrl: process.env.VOLCENGINE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
  chatModel: process.env.VOLCENGINE_CHAT_MODEL ?? "gpt-4",
  embeddingModel: process.env.VOLCENGINE_EMBEDDING_MODEL ?? "embedding",
  vectorStorePath: path.resolve(process.cwd(), "vector_store.json"),
});

await client.ingestText("尺子用于测量长度与画直线。", { source: "demo" });

const result = await client.query("我想找一个工具，能够帮我测量物体长度的，推荐一下", {
  answerMode: "extractive",
});

console.log(result.answer);
console.log(result.documents[0]);
```

## 核心 API

### RagClient

```ts
new RagClient(options)
```

关键参数：

- `apiKey`：OpenAI Compatible 的 Bearer Token
- `baseUrl`：例如火山方舟 `https://ark.cn-beijing.volces.com/api/v3`
- `chatModel`：chat/completions 的 `model`
- `embeddingModel`：embeddings 的 `model`
- `vectorStorePath`：本地 JSON 向量库路径（建议按 embeddingModel 分文件）

### ingestText(text, metadata, options)

- 自动切片并追加写入向量库
- 会基于 `text + metadata` 计算 hash 去重（重复不会重复写入）

### query(question, options)

`answerMode` 用于控制是否调用模型：

- `answerMode: "llm"`：检索 + 调用模型生成回答（默认）
- `answerMode: "extractive"`：不调用模型，从 top 文档抽取/模板化生成 `answer`
- `answerMode: "none"`：只返回 `documents`（不返回 `answer`）

### RagDriver

如果你更喜欢“driver”命名，也可以用：

```ts
import { RagDriver } from "rag";

const driver = new RagDriver({
  apiKey: process.env.VOLCENGINE_API_KEY!,
  baseUrl: process.env.VOLCENGINE_BASE_URL,
  chatModel: process.env.VOLCENGINE_CHAT_MODEL,
  embeddingModel: process.env.VOLCENGINE_EMBEDDING_MODEL,
  vectorStorePath: "./vector_store.json",
});
```

## 项目内示例

- Node 示例（初始化/追加/提问）：[/sdk-test](file:///Users/ashy/Documents/code/mastra-rag-demo/apps/langchain-sdk/sdk-test/)
- Nest 示例（HTTP 接口 + client 脚本）：[/nest-test](file:///Users/ashy/Documents/code/mastra-rag-demo/apps/langchain-sdk/nest-test/)
