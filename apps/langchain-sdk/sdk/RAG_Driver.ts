import { RagClient } from "./RagClient";
import type { AnyObject, DriverInitOptions, RetrievalConfig, RetrievalResult } from "./types";

export class RAG_Driver extends RagClient {
  constructor(options: DriverInitOptions) {
    const baseUrl =
      options.baseURL ??
      process.env.VOLCENGINE_BASE_URL ??
      "https://ark.cn-beijing.volces.com/api/v3";
    const chatModel = options.medela ?? process.env.VOLCENGINE_CHAT_MODEL ?? "gpt-4";
    const embeddingModel =
      options.abding_moxing ??
      process.env.VOLCENGINE_EMBEDDING_MODEL ??
      "text-embedding-3-small";

    super({
      apiKey: options.apikey,
      baseUrl,
      chatModel,
      embeddingModel,
      vectorStorePath: options.vectorStorePath,
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
    });
  }

  async xianglianghua(
    text: string,
    metadata: AnyObject = {},
    config?: { chunkSize?: number; chunkOverlap?: number },
  ): Promise<void> {
    await this.ingestText(text, metadata, config);
  }

  async jiansuo(question: string, config: RetrievalConfig = {}): Promise<RetrievalResult> {
    const answerMode =
      config.useAgent === false ? "extractive" : "llm";
    const result = await this.query(question, { ...config, answerMode } as any);
    return result as any;
  }
}

