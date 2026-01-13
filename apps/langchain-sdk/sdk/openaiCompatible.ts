type EmbeddingsResponse = {
  data: Array<{ embedding: number[] }>;
};

type ChatCompletionsResponse = {
  choices: Array<{ message?: { content?: string } }>;
};

export type OpenAICompatibleClientOptions = {
  apiKey: string;
  baseURL: string;
  chatModel: string;
  embeddingModel: string;
  mock?: boolean;
  mockEmbeddingDimension?: number;
};

export class OpenAICompatibleClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly mock: boolean;
  private readonly mockEmbeddingDimension: number;

  constructor(options: OpenAICompatibleClientOptions) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL.replace(/\/+$/, "");
    this.chatModel = options.chatModel;
    this.embeddingModel = options.embeddingModel;
    this.mock = options.mock ?? false;
    this.mockEmbeddingDimension = options.mockEmbeddingDimension ?? 256;
  }

  async embed(text: string): Promise<number[]> {
    if (this.mock) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      const vec = new Array(this.mockEmbeddingDimension).fill(0);
      for (let i = 0; i < vec.length; i++) {
        const b = bytes[i % Math.max(1, bytes.length)] ?? 0;
        vec[i] = (b / 255) * 2 - 1;
      }
      return vec;
    }

    const res = await fetch(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Embeddings request failed: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as EmbeddingsResponse;
    const embedding = json?.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Embeddings response missing embedding vector");
    }
    return embedding;
  }

  async chat(params: {
    system: string;
    user: string;
    temperature: number;
  }): Promise<string> {
    if (this.mock) {
      const contextMatch = params.user.match(/上下文:\n([\s\S]*?)\n\n问题:\n/);
      const context = contextMatch?.[1]?.trim() ?? "";
      const questionMatch = params.user.match(/\n\n问题:\n([\s\S]*?)\n\n回答:/);
      const question = questionMatch?.[1]?.trim() ?? "";
      const snippet = context ? context.slice(0, 800) : "";
      return `（Mock）问题：${question}\n\n可用上下文片段：\n${snippet}\n\n结论：请配置真实 apikey 以获得模型回答。`;
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.chatModel,
        temperature: params.temperature,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Chat request failed: ${res.status} ${errText}`);
    }

    const json = (await res.json()) as ChatCompletionsResponse;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Chat response missing message content");
    }
    return content;
  }
}
