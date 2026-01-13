import { OpenAICompatibleClient } from "./openaiCompatible";
import type {
  AnyObject,
  RagClientOptions,
  RagIngestOptions,
  RagQueryOptions,
  RagQueryResult,
  RetrievalDocument,
} from "./types";
import { loadStore, resolveStorePath, saveStore, type JsonVectorStore } from "./vectorStore";
import { chunkText, cosineSimilarity, keywordScore, newId, sha256 } from "./utils";

function toStoreSafeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function buildExtractiveAnswer(documents: RetrievalDocument[]): string {
  if (!documents.length) return "我不知道";
  const top = documents[0];
  const text = top.text ?? "";
  try {
    const parsed = JSON.parse(text);
    const topic = typeof parsed?.topic === "string" ? parsed.topic : undefined;
    const description =
      typeof parsed?.description === "string" ? parsed.description : undefined;
    if (topic && description) return `推荐：${topic}\n\n理由：${description}`;
    if (topic) return `推荐：${topic}`;
  } catch {}
  return text.length > 800 ? `${text.slice(0, 800)}...` : text;
}

export class RagClient {
  private readonly vectorStorePath: string;
  private readonly client: OpenAICompatibleClient;
  private readonly defaultChunkSize: number;
  private readonly defaultChunkOverlap: number;
  private readonly mock: boolean;

  constructor(options: RagClientOptions) {
    const apiKey = options.apiKey;
    const baseURL = options.baseUrl;
    const chatModel = options.chatModel;
    const embeddingModel = options.embeddingModel;

    const vectorStorePath =
      options.vectorStorePath ??
      `vector_store.${toStoreSafeName(embeddingModel)}.json`;

    this.vectorStorePath = resolveStorePath(vectorStorePath);

    const mock = options.mock ?? (!apiKey || apiKey === "your_api_key");
    this.mock = mock;
    this.client = new OpenAICompatibleClient({
      apiKey,
      baseURL,
      chatModel,
      embeddingModel,
      mock,
      mockEmbeddingDimension: options.mockEmbeddingDimension,
    });

    this.defaultChunkSize = options.chunkSize ?? 512;
    this.defaultChunkOverlap = options.chunkOverlap ?? 50;
  }

  getStorePath() {
    return this.vectorStorePath;
  }

  async ingestText(
    text: string,
    metadata: AnyObject = {},
    options: RagIngestOptions = {},
  ): Promise<{ added: number; skipped: number }> {
    const chunkSize = options.chunkSize ?? this.defaultChunkSize;
    const chunkOverlap = options.chunkOverlap ?? this.defaultChunkOverlap;
    const chunks = chunkText(text, chunkSize, chunkOverlap);
    if (chunks.length === 0) return { added: 0, skipped: 0 };

    const existing = loadStore(this.vectorStorePath);
    let store: JsonVectorStore;
    if (existing) {
      store = existing;
    } else {
      store = { version: 1, dimension: 0, items: [] };
    }

    const existingHashes = new Set(store.items.map((i) => i.contentHash));
    let added = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      const contentHash = sha256(`${chunk}\n${JSON.stringify(metadata ?? {})}`);
      if (existingHashes.has(contentHash)) {
        skipped++;
        continue;
      }

      const embedding = await this.client.embed(chunk);
      if (store.dimension === 0) store.dimension = embedding.length;
      if (store.dimension !== embedding.length) {
        throw new Error(
          `Embedding dimension mismatch: store=${store.dimension}, got=${embedding.length}`,
        );
      }

      store.items.push({
        id: newId(),
        text: chunk,
        metadata: metadata ?? {},
        embedding,
        createdAt: new Date().toISOString(),
        contentHash,
      });
      existingHashes.add(contentHash);
      added++;
    }

    saveStore(this.vectorStorePath, store);
    return { added, skipped };
  }

  async query(question: string, options: RagQueryOptions = {}): Promise<RagQueryResult> {
    const resolved = {
      similarityThreshold: options.similarityThreshold ?? 0.35,
      semanticTopK: options.semanticTopK ?? 8,
      keywordTopK: options.keywordTopK ?? 8,
      hybridTopK: options.hybridTopK ?? 6,
      strict: options.strict ?? false,
      answerMode: options.answerMode ?? "llm",
      temperature: options.temperature ?? 0.7,
      systemPrompt:
        options.systemPrompt ??
        "你是一个严谨的 RAG 助手。你必须仅基于给定上下文回答；如果上下文不足，请直接回答“我不知道”。",
    } as const;

    const store = loadStore(this.vectorStorePath);
    if (!store || store.items.length === 0) {
      return { documents: [], usedConfig: resolved };
    }

    const q = (question ?? "").trim();
    if (!q) return { documents: [], usedConfig: resolved };

    const qEmbedding = await this.client.embed(q);
    if (store.dimension !== qEmbedding.length) {
      throw new Error(
        `Embedding dimension mismatch: store=${store.dimension}, got=${qEmbedding.length}`,
      );
    }

    const semanticRanked = store.items
      .map((item) => ({
        item,
        semanticScore: cosineSimilarity(qEmbedding, item.embedding),
      }))
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, Math.max(1, resolved.semanticTopK));

    const keywordRanked = store.items
      .map((item) => ({
        item,
        keywordScore: keywordScore(q, item.text),
      }))
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, Math.max(1, resolved.keywordTopK));

    const merged = new Map<string, RetrievalDocument>();
    for (const r of semanticRanked) {
      merged.set(r.item.id, {
        id: r.item.id,
        text: r.item.text,
        metadata: r.item.metadata,
        semanticScore: r.semanticScore,
        keywordScore: 0,
      });
    }
    for (const r of keywordRanked) {
      const existing = merged.get(r.item.id);
      if (existing) {
        existing.keywordScore = r.keywordScore;
      } else {
        merged.set(r.item.id, {
          id: r.item.id,
          text: r.item.text,
          metadata: r.item.metadata,
          semanticScore: 0,
          keywordScore: r.keywordScore,
        });
      }
    }

    const documents = Array.from(merged.values())
      .map((d) => ({
        ...d,
        score: 0.8 * (d.semanticScore ?? 0) + 0.2 * (d.keywordScore ?? 0),
      }))
      .filter((d) => {
        if (this.mock) return true;
        if (resolved.strict) return (d.semanticScore ?? 0) >= resolved.similarityThreshold;
        return (d.score ?? 0) >= resolved.similarityThreshold;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, Math.max(1, resolved.hybridTopK));

    if (resolved.answerMode === "none") {
      return { documents, usedConfig: resolved };
    }

    if (resolved.answerMode === "extractive") {
      return { answer: buildExtractiveAnswer(documents), documents, usedConfig: resolved };
    }

    const context = documents
      .map((d, idx) => {
        const meta = Object.keys(d.metadata ?? {}).length
          ? `\nmetadata: ${JSON.stringify(d.metadata)}`
          : "";
        return `# Document ${idx + 1}\n${d.text}${meta}`;
      })
      .join("\n\n");

    const answer = await this.client.chat({
      system: resolved.systemPrompt,
      temperature: resolved.temperature,
      user: `Context:\n${context}\n\nQuestion:\n${q}\n\nAnswer:`,
    });

    return { answer, documents, usedConfig: resolved };
  }
}
