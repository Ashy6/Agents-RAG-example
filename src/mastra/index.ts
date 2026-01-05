import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { LibSQLVector } from "@mastra/libsql";
import { createVectorQueryTool } from "@mastra/rag";
import { createOpenAI } from "@ai-sdk/openai";
import * as dotenv from 'dotenv';

dotenv.config();

// 0. 设置 AI 提供商 (Provider)

// --- 火山引擎配置 (Volcengine) ---
// 注意：Volcengine 目前兼容 OpenAI v1 API，但在 AI SDK v4/v5 中可能被识别为 Legacy 模型。
// 我们显式使用 'openai' provider 并通过 baseURL 指向火山引擎。
const volcengine = createOpenAI({
  baseURL: process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.VOLCENGINE_API_KEY,
  compatibility: 'compatible', // 使用 'compatible' 模式以兼容 OpenAI-like API
});

// 模型接入点 ID (Endpoint IDs)
const CHAT_MODEL = process.env.VOLCENGINE_CHAT_MODEL || "ep-20250106xxxxxx-xxxxx";
const EMBEDDING_MODEL = process.env.VOLCENGINE_EMBEDDING_MODEL || "ep-20250106xxxxxx-xxxxx";
// -----------------------------

// --- OpenAI 配置 (已注释，待接入 Key 后启用) ---
/*
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const CHAT_MODEL = "gpt-4o";
const EMBEDDING_MODEL = "text-embedding-3-small";
*/
// -----------------------------

// 1. 初始化向量数据库 (LibSQL)
export const libSqlVector = new LibSQLVector({
  connectionUrl: process.env.DATABASE_URL || "file:./mastra.db",
});

// 2. 创建 RAG 工具
const vectorQueryTool = createVectorQueryTool({
  vectorStoreName: "libSqlVector",
  indexName: "embeddings",
  model: volcengine.embedding(EMBEDDING_MODEL),
});

// 3. 定义智能体 (Agent)
export const ragAgent = new Agent({
  name: "KnowledgeAgent",
  instructions: `
    你是一个乐于助人的助手，负责根据提供的上下文回答问题。
    你可以使用 "vectorQueryTool" 工具来搜索知识库。
    在回答之前，务必使用工具查找相关信息。
    如果知识库中没有相关信息，请直接回答 "我的知识库中没有足够的信息来回答这个问题。"
  `,
  model: volcengine(CHAT_MODEL),
  tools: {
    vectorQueryTool,
  },
  // 显式配置不支持流式传输的 Legacy 模式，解决 AI SDK v4/v5 兼容性问题
  // 参见: https://mastra.ai/en/docs/streaming/overview
});

// 4. 创建 Mastra 实例
export const mastra = new Mastra({
  agents: {
    ragAgent,
  },
  vectors: {
    libSqlVector,
  },
});
