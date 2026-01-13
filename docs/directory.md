# 项目目录结构说明

本文件用于快速理解 3 个子项目的目录划分。树状结构与仓库实际路径保持一致，并对关键目录用途做简要标注。

### apps/rag-demo（Mastra RAG Demo）

```text
apps/
└── rag-demo/
    ├── src/
    │   ├── data/
    │   │   └── sample.md
    │   ├── mastra/
    │   │   └── index.ts
    │   ├── scripts/
    │   │   ├── ingest.ts
    │   │   ├── query.ts
    │   │   └── test.ts
    │   └── index.ts
    ├── .env.example
    ├── .gitignore
    ├── PRD.md
    ├── RAG_FLOW.md
    ├── README.md
    ├── SUMMARY.md
    ├── docker-compose.yml
    ├── package-lock.json
    ├── package.json
    └── tsconfig.json
```

- 源代码目录结构：`apps/rag-demo/src/`（核心实现与脚本）
- 资源文件位置：`apps/rag-demo/src/data/`（示例知识文档）
- 配置文件路径：`apps/rag-demo/.env.example`、`apps/rag-demo/docker-compose.yml`、`apps/rag-demo/package.json`、`apps/rag-demo/tsconfig.json`
- 测试文件目录：`apps/rag-demo/src/scripts/test.ts`（当前无独立 `tests/` 目录）

### apps/langchain-rag（LangChain RAG Demo）

```text
apps/
└── langchain-rag/
    ├── data/
    │   └── sample.md
    ├── src/
    │   ├── ingest.ts
    │   └── query.ts
    ├── vector_store/
    │   ├── args.json
    │   ├── docstore.json
    │   └── hnswlib.index
    ├── RAG_FLOW.md
    ├── package.json
    └── tsconfig.json
```

- 源代码目录结构：`apps/langchain-rag/src/`（入库与查询链路）
- 资源文件位置：`apps/langchain-rag/data/`（待入库源文档）、`apps/langchain-rag/vector_store/`（本地向量索引产物，通常由脚本生成）
- 配置文件路径：`apps/langchain-rag/package.json`、`apps/langchain-rag/tsconfig.json`
- 测试文件目录：暂无专用测试目录（当前以 CLI 脚本方式验证）

### apps/langchain-sdk（LangChain RAG SDK + Playground）

```text
apps/
└── langchain-sdk/
    ├── sdk/
    │   ├── RAG_Driver.ts
    │   ├── RagClient.ts
    │   ├── RagDriver.ts
    │   ├── index.ts
    │   ├── openaiCompatible.ts
    │   ├── package-lock.json
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── types.ts
    │   ├── utils.ts
    │   └── vectorStore.ts
    ├── sdk-test/
    │   ├── append.js
    │   ├── append.txt
    │   ├── init.js
    │   ├── package-lock.json
    │   ├── package.json
    │   ├── query.js
    │   └── vector_store.ep-20260106001810-v7lnd.json
    ├── nest-test/
    │   ├── scripts/
    │   │   ├── append-static.mjs
    │   │   ├── append.mjs
    │   │   ├── ask-interactive.mjs
    │   │   ├── ask.mjs
    │   │   ├── http-client.mjs
    │   │   ├── init.mjs
    │   │   └── static-data.json
    │   ├── src/
    │   │   ├── main.ts
    │   │   └── modules/
    │   │       ├── app.module.ts
    │   │       └── rag/
    │   │           ├── rag.controller.ts
    │   │           ├── rag.module.ts
    │   │           ├── rag.pgvector.service.ts
    │   │           └── rag.service.ts
    │   ├── package-lock.json
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── vector_store.ep-20260106001810-v7lnd.json
    ├── demo.ts
    └── package.json
```

- 源代码目录结构：`apps/langchain-sdk/sdk/`（SDK 源码）、`apps/langchain-sdk/nest-test/src/`（服务端源码）
- 资源文件位置：`apps/langchain-sdk/sdk-test/*.txt`（示例数据）、`apps/langchain-sdk/*/vector_store*.json`（本地向量存储快照/产物）
- 配置文件路径：`apps/langchain-sdk/*/package.json`、`apps/langchain-sdk/*/tsconfig.json`
- 测试文件目录：`apps/langchain-sdk/sdk-test/`（以脚本用例方式验证；当前无独立 `tests/` 目录）
