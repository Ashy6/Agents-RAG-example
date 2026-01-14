import * as fs from "fs";
import * as path from "path";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { RagClient } from "@singulay/rag-sdk";

@Injectable()
export class RagService implements OnModuleInit {
  // 核心 SDK 客户端：负责 embedding、向量检索、（可选）调用大模型生成回答
  private ragClient!: RagClient;
  // 向量库文件路径（本项目使用“本地 JSON 文件”保存向量库）
  private storePath!: string;

  onModuleInit() {
    // 以 embedding 模型名生成默认向量库文件名，避免不同维度的向量写入同一个库导致冲突
    const embeddingModel =
      process.env.VOLCENGINE_EMBEDDING_MODEL ?? "embedding";
    const storeFileSafe = embeddingModel.replace(/[^a-zA-Z0-9_-]+/g, "_");

    const storePath =
      process.env.RAG_VECTOR_STORE_PATH ??
      path.resolve(process.cwd(), `vector_store.${storeFileSafe}.json`);

    this.storePath = storePath;
    // 用 OpenAI Compatible 协议的配置初始化 RagClient（当前使用火山方舟兼容接口）
    this.ragClient = new RagClient({
      apiKey: process.env.VOLCENGINE_API_KEY ?? "your_api_key",
      baseUrl:
        process.env.VOLCENGINE_BASE_URL ??
        "https://ark.cn-beijing.volces.com/api/v3",
      chatModel: process.env.VOLCENGINE_CHAT_MODEL ?? "gpt-4",
      embeddingModel: process.env.VOLCENGINE_EMBEDDING_MODEL ?? "gpt-4abding",
      vectorStorePath: storePath,
    });
  }

  getVectorStorePath() {
    return this.storePath;
  }

  // 从 demo.ts 读取 demoData（TS 文件里导出的数组），用于初始化向量库示例数据
  private loadDemoDataFromTsFile(filePath: string): any[] {
    const raw = fs.readFileSync(filePath, "utf-8");
    const transformed = raw.replace(
      /export\s+const\s+demoData\s*=/,
      "const demoData ="
    );
    const loader = new Function(`${transformed}\nreturn demoData;`);
    const demoData = loader();
    if (!Array.isArray(demoData)) {
      throw new Error("demo.ts 中的 demoData 不是数组");
    }
    return demoData;
  }

  // 初始化：把 demo.ts 里每一条记录序列化成文本，逐条写入向量库
  // - metadata 带上 source/index/topic，便于检索结果追踪来源
  async initFromDemo(): Promise<{
    ok: true;
    count: number;
    vectorStorePath: string;
  }> {
    const demoPath =
      process.env.RAG_DEMO_PATH ?? path.resolve(process.cwd(), "../demo.ts");
    const demoData = this.loadDemoDataFromTsFile(demoPath);
    console.log("demoData", demoData);
    for (let i = 0; i < demoData.length; i++) {
      const item = demoData[i];
      const text = JSON.stringify(item);
      const topic = item?.topic;
      await this.ragClient.ingestText(text, {
        source: "demo.ts",
        index: i,
        topic: typeof topic === "string" ? topic : undefined,
      });
    }

    return {
      ok: true,
      count: demoData.length,
      vectorStorePath: this.storePath,
    };
  }

  // 写入/追加：把文本切片 -> 对每个 chunk 做 embedding -> 写入本地 JSON 向量库文件
  async ingestText(text: string, metadata: Record<string, any> = {}) {
    await this.ragClient.ingestText(text, metadata);
    return { ok: true };
  }

  // 查询：向量检索（语义 + 关键词混合）并按配置决定是否生成 answer
  // - useAgent=false 时，会自动转成 answerMode=extractive（不调用大模型）
  // - 也可以直接传 answerMode=none / extractive / llm
  async query(question: string, config: Record<string, any> = {}) {
    const similarityThreshold =
      config.SIMILARITY_THRESHOLD ?? config.similarityThreshold;
    const semanticTopK = config.SEMANTIC_TOP_K ?? config.semanticTopK;
    const keywordTopK = config.KEYWORD_TOP_K ?? config.keywordTopK;
    const hybridTopK = config.HYBRID_TOP_K ?? config.hybridTopK;
    const strict = config.strict;
    const temperature = config.temperature;
    const systemPrompt = config.systemPrompt;

    const answerMode =
      config.answerMode ?? (config.useAgent === false ? "extractive" : "llm");

    return this.ragClient.query(question, {
      similarityThreshold,
      semanticTopK,
      keywordTopK,
      hybridTopK,
      strict,
      temperature,
      systemPrompt,
      answerMode,
    });
  }

  // 兼容旧命名：对外仍保留历史方法名，内部转发到语义化方法
  async xianglianghua(text: string, metadata: Record<string, any> = {}) {
    return this.ingestText(text, metadata);
  }

  // 兼容旧命名：对外仍保留历史方法名，内部转发到语义化方法
  async jiansuo(question: string, config: Record<string, any> = {}) {
    return this.query(question, config);
  }
}
