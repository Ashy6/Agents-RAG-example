
# Mastra Framework Guide

Mastra is a TypeScript-first AI framework designed to simplify the development of AI agents and RAG systems.

## Core Components
1. **Agents**: Autonomous entities that can use tools and LLMs.
2. **Workflows**: Graph-based orchestration of tasks.
3. **RAG**: Retrieval-Augmented Generation for grounding AI in data.

## RAG Process
To implement RAG in Mastra, you need to:
- Create an MDocument from text.
- Chunk the document using strategies like recursive splitting.
- Generate embeddings using OpenAI or other providers.
- Store vectors in LibSQL or PgVector.

## Benefits
Mastra provides type safety, easy integration with Vercel AI SDK, and robust observability.
    