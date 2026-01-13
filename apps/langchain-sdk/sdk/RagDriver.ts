import { RagClient } from "./RagClient";
import type { RagDriverOptions } from "./types";

export class RagDriver extends RagClient {
  constructor(options: RagDriverOptions) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3",
      chatModel: options.chatModel ?? "gpt-4",
      embeddingModel: options.embeddingModel ?? "text-embedding-3-small",
      vectorStorePath: options.vectorStorePath,
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
      mock: options.mock,
      mockEmbeddingDimension: options.mockEmbeddingDimension,
    });
  }
}

