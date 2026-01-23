/**
 * RAG API 测试文件
 * 测试已部署的服务: https://rag-api.rowlandw3ai.shop/rag
 *
 * 测试内容:
 * 1. /rag/init - 初始化向量存储
 * 2. /rag/append - 追加数据
 * 3. /rag/query - 查询数据
 */

import * as demoModule from "../../langchain-sdk/demo";

type DemoItem = { topic?: string; [key: string]: unknown };

const rawDemoData: unknown =
  (demoModule as any).demoData ?? (demoModule as any).default?.demoData;
if (!Array.isArray(rawDemoData)) {
  throw new Error("demoData 不是数组，无法用于 /rag/init 测试");
}
const demoData = rawDemoData as DemoItem[];

const pEnv = ((globalThis as any).process?.env ?? {}) as Record<string, string | undefined>;
const RAW_BASE_URL = (pEnv.RAG_API_BASE_URL ?? "https://rag-api.rowlandw3ai.shop").replace(/\/+$/, "");
const BASE_URL = RAW_BASE_URL.endsWith("/rag") ? RAW_BASE_URL : `${RAW_BASE_URL}/rag`;
const apiUrl = (path: string) => `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
const useMock = ["1", "true", "yes"].includes(String(pEnv.RAG_API_MOCK ?? "").toLowerCase());

// 用于追加测试的额外数据
const appendData = [
  {
    topic: "西瓜",
    description: "西瓜是夏季常见的解暑水果，水分含量极高。",
    benefits: [
      "水分充足，适合炎热天气补充水分。",
      "含有番茄红素等植物化合物。",
      "热量相对较低，适合作为消暑零食。",
    ],
    funFacts: [
      "西瓜的果肉颜色有红、黄等多种。",
      "敲击西瓜听声音是判断成熟度的民间方法。",
      "西瓜籽也可以食用或加工。",
    ],
  },
  {
    topic: "锤子",
    description: "锤子是常见的敲击工具，用于钉钉子或敲打物体。",
    benefits: [
      "施力集中，便于快速完成敲击任务。",
      "手柄长度可根据需求选择。",
      "多种锤头材质适合不同场景。",
    ],
    funFacts: [
      "羊角锤可以用于拔钉子。",
      "橡胶锤适合敲击不耐冲击的材料。",
      "使用时要注意握柄姿势避免受伤。",
    ],
  },
];

// 辅助函数: 打印分隔线
function printSeparator(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60) + "\n");
}

// 辅助函数: 打印 JSON 数据
function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const trimmed = text.trim();

  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const shouldTryJson = contentType.includes("application/json") || looksLikeJson;

  if (!shouldTryJson) {
    return { ok: false as const, contentType, text };
  }

  try {
    return { ok: true as const, contentType, json: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      ok: false as const,
      contentType,
      text,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printNonJsonBody(text: string, maxLen = 800) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  console.log("非 JSON 响应（截断）:");
  console.log(oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}...` : oneLine);
}

// 测试 1: 健康检查
async function testHealth() {
  printSeparator("测试 0: 健康检查 GET /rag/health");

  try {
    const response = await fetch(apiUrl("/health"));
    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    return response.ok;
  } catch (error) {
    console.error("健康检查失败:", error);
    return false;
  }
}

// 测试 2: 初始化接口
async function testInit() {
  printSeparator("测试 1: 初始化接口 POST /rag/init");

  console.log(`准备初始化 ${demoData.length} 条数据...`);
  console.log("数据主题:", demoData.map((d) => d.topic).join(", "));
  console.log("mock:", useMock);
  console.log("\n发送请求...\n");

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl("/init"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: demoData, mock: useMock }),
    });
    const endTime = Date.now();

    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("耗时:", `${endTime - startTime}ms`);
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    const data = (body.ok ? body.json : null) as any;
    if (data?.ok) {
      console.log("\n✅ 初始化成功!");
      console.log(`   - 成功导入 ${data.count} 条数据`);
      console.log(`   - 向量存储键: ${data.vectorStoreKey}`);
    } else {
      console.log("\n❌ 初始化失败:", data?.error ?? (body.ok ? "unknown error" : body.error ?? "non-json response"));
    }

    return Boolean(data?.ok);
  } catch (error) {
    console.error("初始化请求失败:", error);
    return false;
  }
}

// 测试 3: 追加接口
async function testAppend() {
  printSeparator("测试 2: 追加接口 POST /rag/append");

  console.log(`准备追加 ${appendData.length} 条数据...`);
  console.log("追加主题:", appendData.map((d) => d.topic).join(", "));
  console.log("mock:", useMock);
  console.log("\n发送请求...\n");

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl("/append"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: appendData, mock: useMock }),
    });
    const endTime = Date.now();

    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("耗时:", `${endTime - startTime}ms`);
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    const data = (body.ok ? body.json : null) as any;
    if (data?.ok) {
      console.log("\n✅ 追加成功!");
      console.log(`   - 成功追加 ${data.count} 条数据`);
    } else {
      console.log("\n❌ 追加失败:", data?.error ?? (body.ok ? "unknown error" : body.error ?? "non-json response"));
    }

    return Boolean(data?.ok);
  } catch (error) {
    console.error("追加请求失败:", error);
    return false;
  }
}

// 测试 4: 查询接口 - 文档模式
async function testQueryDocuments() {
  printSeparator("测试 3a: 查询接口 POST /rag/query (documents 模式)");

  const question = "苹果有什么营养价值？";
  console.log("问题:", question);
  console.log("模式: documents (返回相关文档)\n");
  console.log("mock:", useMock);

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl("/query"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: question,
        answerMode: "documents",
        topK: 3,
        mock: useMock,
      }),
    });
    const endTime = Date.now();

    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("耗时:", `${endTime - startTime}ms`);
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    const data = (body.ok ? body.json : null) as any;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`\n✅ 查询成功! 返回 ${data.length} 条相关文档`);
      data.forEach((doc: { metadata?: { topic?: string }; score?: number }, i: number) => {
        console.log(`   ${i + 1}. 主题: ${doc.metadata?.topic || "未知"}, 相似度: ${doc.score?.toFixed(4) || "N/A"}`);
      });
    }

    return response.ok && Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error("查询请求失败:", error);
    return false;
  }
}

// 测试 5: 查询接口 - 回答模式
async function testQueryAnswer() {
  printSeparator("测试 3b: 查询接口 POST /rag/query (answer 模式)");

  const question = "钉子在木工中有什么用途？使用时需要注意什么？";
  console.log("问题:", question);
  console.log("模式: answer (返回 AI 生成的回答)\n");
  console.log("mock:", useMock);

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl("/query"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: question,
        answerMode: "answer",
        mock: useMock,
      }),
    });
    const endTime = Date.now();

    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("耗时:", `${endTime - startTime}ms`);
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    const data = (body.ok ? body.json : null) as any;
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "string") {
      console.log("\n✅ AI 回答:");
      console.log("─".repeat(40));
      console.log(data[0]);
      console.log("─".repeat(40));
    }

    return response.ok && Array.isArray(data) && typeof data?.[0] === "string" && Boolean(data[0]);
  } catch (error) {
    console.error("查询请求失败:", error);
    return false;
  }
}

// 测试 6: 查询追加的数据
async function testQueryAppendedData() {
  printSeparator("测试 3c: 查询追加的数据 POST /rag/query");

  const question = "西瓜";
  console.log("问题:", question);
  console.log("说明: 测试追加的数据是否可被正确检索\n");
  console.log("mock:", useMock);

  try {
    const startTime = Date.now();
    const response = await fetch(apiUrl("/query"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: question,
        answerMode: "documents",
        semanticTopK: 1,
        keywordTopK: 20,
        hybridTopK: 20,
        mock: useMock,
      }),
    });
    const endTime = Date.now();

    const body = await readResponseBody(response);

    console.log("状态码:", response.status);
    console.log("响应 URL:", response.url);
    console.log("content-type:", response.headers.get("content-type") ?? "");
    console.log("耗时:", `${endTime - startTime}ms`);
    console.log("响应数据:");
    if (body.ok) printJson(body.json);
    else printNonJsonBody(body.text);

    const data = (body.ok ? body.json : null) as any;
    if (Array.isArray(data) && data.length > 0) {
      const hasWatermelon = data.some(
        (doc: { metadata?: { topic?: string } }) => doc.metadata?.topic === "西瓜"
      );
      if (hasWatermelon) {
        console.log("\n✅ 追加的数据可被正确检索!");
      } else {
        console.log("\n❌ 未找到追加的'西瓜'数据（检索未命中）");
      }
      return response.ok && hasWatermelon;
    }

    return false;
  } catch (error) {
    console.error("查询请求失败:", error);
    return false;
  }
}

// 主测试函数
async function runAllTests() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          RAG API 接口测试                                  ║");
  console.log("║          服务地址: " + BASE_URL.padEnd(38) + "║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const results: { name: string; success: boolean }[] = [];

  // 健康检查
  results.push({
    name: "健康检查",
    success: await testHealth(),
  });

  // 初始化测试
  results.push({
    name: "初始化接口 /rag/init",
    success: await testInit(),
  });

  // 追加测试
  results.push({
    name: "追加接口 /rag/append",
    success: await testAppend(),
  });

  // 查询测试 - 文档模式
  results.push({
    name: "查询接口 (documents)",
    success: await testQueryDocuments(),
  });

  // 查询测试 - 回答模式
  results.push({
    name: "查询接口 (answer)",
    success: await testQueryAnswer(),
  });

  // 查询追加的数据
  results.push({
    name: "查询追加数据",
    success: await testQueryAppendedData(),
  });

  // 打印测试结果汇总
  printSeparator("测试结果汇总");

  let passCount = 0;
  let failCount = 0;

  results.forEach((result) => {
    const status = result.success ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}  ${result.name}`);
    if (result.success) passCount++;
    else failCount++;
  });

  console.log("\n" + "─".repeat(40));
  console.log(`总计: ${results.length} 个测试`);
  console.log(`通过: ${passCount} 个`);
  console.log(`失败: ${failCount} 个`);
  console.log("─".repeat(40) + "\n");

  return failCount === 0;
}

// 运行测试
runAllTests()
  .then((success) => {
    const proc = (globalThis as any).process;
    if (proc?.exit) proc.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("测试执行出错:", error);
    const proc = (globalThis as any).process;
    if (proc?.exit) proc.exit(1);
  });
