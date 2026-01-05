import { mastra } from "../mastra/index";
import * as dotenv from 'dotenv';
import assert from 'assert';

dotenv.config();

async function runTests() {
  console.log("🧪 开始自动化测试...");

  const agent = mastra.getAgent("ragAgent");
  if (!agent) throw new Error("找不到 Agent");

  // 测试用例 1: 检索准确性
  // 我们期望 Agent 基于入库文档知道什么是 Mastra
  const query1 = "Mastra 的核心组件有哪些?";
  console.log(`\n📝 测试用例 1: 提问 "${query1}"`);
  
  try {
    const response = await agent.generate(query1);
    const text = response.text.toLowerCase();
    
    console.log("回答:", response.text);

    // 断言
    const keywords = ["agents", "workflows", "rag", "智能体", "工作流"];
    const found = keywords.filter(k => text.includes(k));
    
    if (found.length >= 2) {
      console.log("✅ 测试用例 1 通过: 包含预期的关键词。");
    } else {
      console.error("❌ 测试用例 1 失败: 缺少预期的关键词。");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ 测试用例 1 错误:", error);
    process.exit(1);
  }

  // 测试用例 2: 幻觉检查 / 域外问题
  // 我们配置了 Agent 在不知道答案时说 "没有足够的信息"
  const query2 = "火星的首都是哪里?";
  console.log(`\n📝 测试用例 2: 提问 "${query2}" (域外问题)`);

  try {
    const response = await agent.generate(query2);
    console.log("回答:", response.text);
    
    if (response.text.includes("没有足够的信息") || response.text.includes("context") || response.text.includes("knowledge base")) {
      console.log("✅ 测试用例 2 通过: Agent 承认知识不足。");
    } else {
      console.warn("⚠️ 测试用例 2 警告: Agent 可能产生了幻觉或使用了通用知识。");
    }
  } catch (error) {
    console.error("❌ 测试用例 2 错误:", error);
  }

  console.log("\n🎉 所有测试完成。");
}

runTests().catch(console.error);
