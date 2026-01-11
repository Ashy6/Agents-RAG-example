# Mastra 框架概览

Mastra 是一个用于构建 AI 应用程序的 TypeScript 框架。它提供以下工具：

- **Agents (智能体)**: 能够执行任务的自主实体。
- **RAG (检索增强生成)**: 将 AI 基于数据落地的技术。
- **Workflows (工作流)**: 编排复杂的动作序列。

## 核心组件

1. **Mastra Core**: 框架的核心，负责管理智能体和工作流。
2. **Mastra RAG**: 用于文档处理、切片和向量化的专用工具。
3. **Mastra PG**: 使用 pgvector 的 PostgreSQL 向量存储集成。
4. **Mastra OpenAI**: 集成 OpenAI 的 LLM 模型。
5. **Mastra Workflows**: 用于编排和管理工作流的组件。

## RAG 在 Mastra 中如何工作

RAG 包含以下步骤：

1. **摄入 (Ingestion)**: 加载文档并将其分割成切片。
2. **向量化 (Embedding)**: 使用 Embedding 模型（如 OpenAI）将切片转换为向量表示。
3. **存储 (Storage)**: 将向量保存到数据库中（如支持 pgvector 的 PostgreSQL）。
4. **检索 (Retrieval)**: 根据用户的问题在数据库中查询相关的切片。
5. **生成 (Generation)**: 使用 LLM 回答问题，并利用检索到的切片作为上下文。

Mastra 通过 `MDocument` 和向量存储集成简化了这一流程。
