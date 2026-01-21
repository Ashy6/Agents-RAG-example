import { Body, Controller, Get, Post } from "@nestjs/common";
import { RagService } from "./rag.service";

// RAG HTTP API：对 SDK（RagClient）进行一层简单的 HTTP 封装
// - /rag/init：用 demo.ts 初始化向量库
// - /rag/ingest：写入任意文本（用于批量/手动灌库）
// - /rag/append：追加文本（语义同 ingest，但默认带上 source=append）
// - /rag/query、/rag/ask：检索（可选生成回答）
@Controller("rag")
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Get("health")
  health() {
    // 用于健康检查 + 返回当前向量库文件位置，便于排查环境问题
    return { ok: true, vectorStorePath: this.ragService.getVectorStorePath() };
  }

  @Post("init")
  async init(
    @Body()
    body?: {
      data?: any[];
    },
  ) {
    if (body && "data" in body) {
      return this.ragService.initFromJsonArray(body.data);
    }
    return this.ragService.initFromDemo();
  }

  @Post("ingest")
  async ingest(
    @Body()
    body: {
      // 要写入向量库的原始文本
      text: string;
      // 可选元数据：会随 chunk 一起存到向量库，并参与去重哈希
      metadata?: Record<string, any>;
    },
  ) {
    return this.ragService.ingestText(body.text, body.metadata ?? {});
  }

  @Post("append")
  async append(
    @Body()
    body: {
      data?: any[];
      text?: string;
      metadata?: Record<string, any>;
    },
  ) {
    if (Array.isArray(body.data)) {
      return this.ragService.appendJsonArray(body.data);
    }
    return this.ragService.ingestText(body.text ?? "", {
      ...(body.metadata ?? {}),
      source: (body.metadata?.source ?? "append") as any,
    });
  }

  @Post("query")
  async query(
    @Body()
    body: {
      // 用户问题/查询语句
      question: string;
      // 检索/回答配置：可以传 useAgent=false 或 answerMode=extractive 走非 LLM 回答
      config?: Record<string, any>;
    },
  ) {
    return this.ragService.queryAsArray(body.question, body.config ?? {});
  }

  @Post("ask")
  async ask(
    @Body()
    body: {
      // 语义上等价于 query（保留更符合“问答”的命名）
      question: string;
      config?: Record<string, any>;
    },
  ) {
    return this.ragService.queryAsArray(body.question, body.config ?? {});
  }
}
