# LangChain SDK Playground

本子项目用于验证与演示可复用的 RAG SDK，并提供脚本测试与 Nest 服务端示例。

## 目录说明

- `sdk/`：RAG SDK（TypeScript），用于封装向量存储、追加与检索调用能力
- `sdk-test/`：Node 脚本形式的 SDK 使用示例（init/append/query）
- `nest-test/`：NestJS 服务端示例，用 HTTP API 方式暴露 RAG 能力

## 常用命令

```bash
npm run build:sdk
```
