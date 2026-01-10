import { mastra } from "./mastra";

async function main() {
  const query = process.argv[2] || "Mastra 的 RAG 是如何工作的?";
  console.log(`\n🤖 用户提问: ${query}\n`);

  const agent = mastra.getAgent("ragAgent");

  if (!agent) {
    console.error("找不到 Agent!");
    return;
  }

  try {
    console.log("思考中...");
    const streamResult = await agent.streamLegacy(query);
    console.log("\n💡 Agent 回答:");
    for await (const chunk of streamResult.textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n  streamResult:", streamResult.text);
  } catch (error) {
    console.error("生成回答时出错:", error);
  }
}

main().catch(console.error);
