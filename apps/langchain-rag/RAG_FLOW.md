# LangChain RAG 项目流程文档

本文档详细说明了本项目 (LangChain RAG Demo) 的工作流程、数据流向以及核心组件的交互方式。

## 1. 核心流程图 (Flowchart)

```mermaid
graph TD
    subgraph Ingestion ["数据入库阶段 (Ingestion Phase)"]
        A["原始文档 (data/sample.md)"] -->|TextLoader| B(Document 对象)
        B -->|RecursiveCharacterTextSplitter| C["文本切片 (Chunks)"]
        C -->|OpenAIEmbeddings (Volcengine)| D{"Embedding API"}
        D -->|返回向量| E["向量数据 (Vectors)"]
        E -->|HNSWLib| F[("本地向量库 (vector_store/)")]
        
        style A fill:#e1f5fe
        style F fill:#fff9c4
    end

    subgraph Query ["检索问答阶段 (Query Phase)"]
        G["用户提问 (CLI)"] -->|RunnablePassthrough| H{"构建 Chain"}
        
        subgraph Retrieval ["检索 (Retrieval)"]
            H -->|asRetriever| I[HNSWLib Retriever]
            I -->|Similarity Search| F
            F -->|返回 Top K 切片| J["上下文 (Context)"]
        end
        
        subgraph Generation ["生成 (Generation)"]
            J -->|formatDocumentsAsString| K["格式化上下文"]
            K -->|注入 Prompt| L["Prompt Template"]
            G -->|注入 Question| L
            L -->|ChatOpenAI (Volcengine)| M{"Chat API"}
            M -->|StringOutputParser| N[最终回答]
        end
        
        style G fill:#e1f5fe
        style N fill:#dcedc8
    end
```

## 2. 详细步骤说明

整个 RAG 系统分为两个主要阶段：**数据准备（入库）** 和 **问答（检索与生成）**。

### 第一阶段：数据入库 (Ingestion)

*对应脚本*: `src/ingest.ts`

1. **数据源 (Source)**:
    * 读取 `data/sample.md` (LangChain 深度介绍文档)。
    * 使用 `TextLoader` 或 `DirectoryLoader` 加载。

2. **文档切分 (Splitting)**:
    * 使用 `RecursiveCharacterTextSplitter`。
    * 策略：按 `\n\n`, `\n`, ` ` 顺序递归切分。
    * 参数：`chunkSize: 1000`, `chunkOverlap: 200`。
    * *目的*: 保证语义完整性的同时适配模型上下文窗口。

3. **向量化 (Embedding)**:
    * 组件：`OpenAIEmbeddings` (配置为兼容火山引擎)。
    * 模型：`doubao-embedding` (ep-20260106001810-v7lnd)。
    * 动作：将每个切片转换为浮点数向量。

4. **存储 (Storage)**:
    * 组件：`HNSWLib` (Hierarchical Navigable Small World)。
    * 动作：将向量索引和原始文本保存到本地文件系统 `vector_store/` 目录。
    * *特点*: 轻量级、基于文件的近似最近邻搜索库。

---

### 第二阶段：检索与生成 (Retrieval & Generation)

*对应脚本*: `src/query.ts`

1. **加载向量库**:
    * 从 `vector_store/` 目录加载已保存的 HNSWLib 索引。

2. **构建检索器 (Retriever)**:
    * 将向量库转换为检索器接口 (`vectorStore.asRetriever(k=2)`).
    * 配置为返回最相关的 2 个片段。

3. **构建 LCEL 链 (RunnableSequence)**:
    * 使用 LangChain Expression Language 定义处理流。
    * **Context**: 自动调用检索器查找相关文档 -> 拼接为字符串。
    * **Prompt**: 使用预定义的中文模板 ("请基于以下上下文回答...")。
    * **Model**: 调用 `ChatOpenAI` (火山引擎 Doubao-Pro)。
    * **Parser**: 将模型输出对象解析为纯文本字符串。

4. **执行 (Invoke)**:
    * 用户输入问题。
    * 链自动执行：检索 -> 组装 Prompt -> 调用大模型 -> 返回结果。

## 3. 关键组件对照表

| 组件类型        | 本项目使用                       | 作用                   |
| :-------------- | :------------------------------- | :--------------------- |
| **Loader**      | `TextLoader`                     | 加载 Markdown 文件     |
| **Splitter**    | `RecursiveCharacterTextSplitter` | 智能切分长文本         |
| **Embedding**   | `OpenAIEmbeddings`               | 调用火山引擎向量化接口 |
| **VectorStore** | `HNSWLib`                        | 本地向量存储与索引     |
| **Model**       | `ChatOpenAI`                     | 调用火山引擎对话接口   |
| **Chain**       | `RunnableSequence`               | 编排 RAG 逻辑流        |
