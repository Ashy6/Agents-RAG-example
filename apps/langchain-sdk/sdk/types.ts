export type AnyObject = Record<string, any>;

export type SupportedPlatform = "火山" | "Volcengine" | "OpenAI";

export type DriverInitOptions = {
  apikey: string;
  pingtai?: SupportedPlatform | string;
  medela?: string;
  abding_moxing?: string;
  baseURL?: string;
  vectorStorePath?: string;
  chunkSize?: number;
  chunkOverlap?: number;
};

export type RagDriverOptions = {
  apiKey: string;
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  vectorStorePath?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  mock?: boolean;
  mockEmbeddingDimension?: number;
};

export type RagClientOptions = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  vectorStorePath?: string;
  vectorStoreStorage?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  chunkSize?: number;
  chunkOverlap?: number;
  mock?: boolean;
  mockEmbeddingDimension?: number;
};

export type RagIngestOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

export type RagAnswerMode = "llm" | "extractive" | "none";

export type RagQueryOptions = {
  similarityThreshold?: number;
  semanticTopK?: number;
  keywordTopK?: number;
  hybridTopK?: number;
  strict?: boolean;
  answerMode?: RagAnswerMode;
  temperature?: number;
  systemPrompt?: string;
};

export type RetrievalConfig = {
  similarityThreshold?: number;
  semanticTopK?: number;
  keywordTopK?: number;
  hybridTopK?: number;
  strict?: boolean;
  useAgent?: boolean;
  temperature?: number;
  systemPrompt?: string;
};

export type RetrievalDocument = {
  id: string;
  text: string;
  metadata: AnyObject;
  semanticScore?: number;
  keywordScore?: number;
  score?: number;
};

export type RetrievalResult = {
  answer?: string;
  documents: RetrievalDocument[];
  usedConfig: Required<
    Pick<
      RetrievalConfig,
      | "similarityThreshold"
      | "semanticTopK"
      | "keywordTopK"
      | "hybridTopK"
      | "strict"
      | "useAgent"
      | "temperature"
      | "systemPrompt"
    >
  >;
};

export type RagQueryResult = {
  answer?: string;
  documents: RetrievalDocument[];
  usedConfig: Required<
    Pick<
      RagQueryOptions,
      | "similarityThreshold"
      | "semanticTopK"
      | "keywordTopK"
      | "hybridTopK"
      | "strict"
      | "answerMode"
      | "temperature"
      | "systemPrompt"
    >
  >;
};
