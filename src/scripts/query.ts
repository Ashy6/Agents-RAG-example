import { mastra } from "../mastra/index";
import * as dotenv from 'dotenv';

dotenv.config();

async function query() {
  const agent = mastra.getAgent("ragAgent");
  
  if (!agent) {
    throw new Error("找不到 Agent");
  }

  const question = process.argv[2] || "什么是 Mastra?";
  
  console.log(`❓ 问题: ${question}`);
  console.log("🤖 Agent 正在思考...");

  try {
    // 使用 streamLegacy() 而不是 generate() 来绕过 v4/v5 兼容性检查
    // 虽然方法名是 stream，但它处理的是旧版流式/非流式响应
    const streamResult = await agent.streamLegacy(question);
    
    console.log("\n💡 回答:");
    for await (const chunk of streamResult.textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n"); // 换行
  } catch (error) {
    console.error("❌ 查询 Agent 时出错:", error);
  }
}

query().catch(console.error);
