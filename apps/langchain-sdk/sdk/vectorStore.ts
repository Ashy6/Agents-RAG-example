import * as fs from "fs";
import * as path from "path";
import { AnyObject } from "./types";

export type StoredVectorItem = {
  id: string;
  text: string;
  metadata: AnyObject;
  embedding: number[];
  createdAt: string;
  contentHash: string;
};

export type JsonVectorStore = {
  version: 1;
  dimension: number;
  items: StoredVectorItem[];
};

export function resolveStorePath(storePath?: string): string {
  const defaultPath = path.join(process.cwd(), "vector_store.json");
  return storePath ? path.resolve(process.cwd(), storePath) : defaultPath;
}

export function loadStore(storePath: string): JsonVectorStore | null {
  if (!fs.existsSync(storePath)) return null;
  const raw = fs.readFileSync(storePath, "utf-8");
  const parsed = JSON.parse(raw) as JsonVectorStore;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
    throw new Error(`Invalid vector store format: ${storePath}`);
  }
  return parsed;
}

export function saveStore(storePath: string, store: JsonVectorStore): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
}

