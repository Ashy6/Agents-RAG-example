import { MDocument } from "@mastra/rag";
import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { libSqlVector } from "../mastra/index";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from "openai";

dotenv.config();

async function ingest() {
  // 校验环境变量
  if (!process.env.VOLCENGINE_API_KEY) {
    console.error("❌ 错误: .env 文件中缺少 VOLCENGINE_API_KEY。");
    process.exit(1);
  }

  if (!process.env.VOLCENGINE_EMBEDDING_MODEL || process.env.VOLCENGINE_EMBEDDING_MODEL.includes('ep-20250106xxxxxx-xxxxx')) {
    console.error("❌ 错误: .env 文件中 VOLCENGINE_EMBEDDING_MODEL 无效。");
    console.error("👉 请将占位符替换为您实际的接入点 ID (Endpoint ID)。");
    process.exit(1);
  }

  const EMBEDDING_MODEL = process.env.VOLCENGINE_EMBEDDING_MODEL;

  console.log("🚀 开始数据入库流程...");

  // 1. 创建示例文档 (或从文件读取)
  const docPath = path.join(__dirname, "../data/sample.md");
  const docDir = path.dirname(docPath);

  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  if (!fs.existsSync(docPath)) {
    const sampleContent = `
# Mastra 框架指南

Mastra 是一个 TypeScript 优先的 AI 框架，旨在简化 AI Agent 和 RAG 系统的开发。

## 核心组件
1. **Agents (智能体)**: 能够使用工具和 LLM 的自主实体。
2. **Workflows (工作流)**: 基于图的任务编排。
3. **RAG (检索增强生成)**: 用于将 AI 基于数据落地的技术。

## RAG 流程
要在 Mastra 中实现 RAG，你需要:
- 从文本创建 MDocument。
- 使用递归分割等策略对文档进行切片 (Chunking)。
- 使用 OpenAI 或其他提供商生成 Embedding (向量)。
- 将向量存储在 LibSQL 或 PgVector 中。

## 优势
Mastra 提供类型安全、与 Vercel AI SDK 的轻松集成以及强大的可观测性。
    `;
    fs.writeFileSync(docPath, sampleContent);
    console.log("📝 已在 data/sample.md 创建示例文档");
  }

  const fileContent = fs.readFileSync(docPath, "utf-8");

  // 2. 创建 MDocument 并切片
  console.log("✂️  正在对文档进行切片...");
  const doc = MDocument.fromText(fileContent);

  const chunks = await doc.chunk({
    strategy: "recursive",
    maxSize: 512,
    overlap: 50,
  });

  console.log(`ℹ️  生成了 ${chunks.length} 个切片。`);

  // 3. 生成 Embeddings
  console.log(`🧠 正在使用 ${EMBEDDING_MODEL} 生成向量...`);

  // 注意：使用原生 OpenAI SDK 是因为 AI SDK 的 createOpenAI 可能会注入不兼容的参数
  // 或包含与火山引擎特定要求冲突的模型名称验证逻辑。

  // --- 火山引擎配置 (Volcengine) ---
  const openai = new OpenAI({
    apiKey: process.env.VOLCENGINE_API_KEY,
    baseURL: process.env.VOLCENGINE_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  });
  // -----------------------------

  // --- OpenAI 配置 (已注释，待接入 Key 后启用) ---
  // const openai = new OpenAI({
  //   apiKey: process.env.OPENAI_API_KEY, // 确保 .env 中有 OPENAI_API_KEY
  // });
  // -----------------------------

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks.map((c) => c.text),
    encoding_format: "float",
  });

  const embeddings = embeddingResponse.data.map(d => d.embedding);

  // 4. 存储到 LibSQL
  console.log("💾 正在存储到 LibSQL...");

  // 如果索引不存在则创建
  // 动态获取 Embedding 维度，避免模型切换导致维度不匹配
  const dimension = embeddings.length > 0 ? embeddings[0].length : 1536;
  console.log(`ℹ️  检测到向量维度: ${dimension}`);

  await libSqlVector.createIndex({
    indexName: "embeddings",
    dimension: dimension
  });

  // 更新或插入向量
  await libSqlVector.upsert({
    indexName: "embeddings",
    vectors: embeddings,
    metadata: chunks.map((c, i) => ({
      text: c.text,
      ...c.metadata,
      id: `chunk-${i}-${Date.now()}`
    })),
  });

  console.log("✅ 入库完成!");
}

ingest().catch((err) => {
  console.error("❌ 入库失败:", err);
  process.exit(1);
});
