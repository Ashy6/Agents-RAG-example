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

export type VectorStoreStorage = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
};

export function resolveStorePath(storePath?: string): string {
  const cwd =
    typeof process !== "undefined" && typeof process.cwd === "function"
      ? process.cwd()
      : "";
  const defaultPath = cwd ? `${cwd}/vector_store.json` : "vector_store.json";
  if (!storePath) return defaultPath;
  if (!cwd) return storePath;
  if (storePath.startsWith("/")) return storePath;
  if (/^[a-zA-Z]:[\\/]/.test(storePath)) return storePath;
  return `${cwd}/${storePath}`;
}

export function createNodeFsStorage(): VectorStoreStorage {
  return {
    async get(key) {
      const fs = await import("fs");
      try {
        return fs.readFileSync(key, "utf-8");
      } catch (err: any) {
        if (err?.code === "ENOENT") return null;
        throw err;
      }
    },
    async put(key, value) {
      const fs = await import("fs");
      const path = await import("path");
      fs.mkdirSync(path.dirname(key), { recursive: true });
      fs.writeFileSync(key, value, "utf-8");
    },
    async delete(key) {
      const fs = await import("fs");
      try {
        fs.rmSync(key, { force: true });
      } catch {}
    },
  };
}

export async function loadStore(
  storage: VectorStoreStorage,
  key: string,
): Promise<JsonVectorStore | null> {
  const raw = await storage.get(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as JsonVectorStore;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
    throw new Error(`Invalid vector store format: ${key}`);
  }
  return parsed;
}

export async function saveStore(
  storage: VectorStoreStorage,
  key: string,
  store: JsonVectorStore,
): Promise<void> {
  await storage.put(key, JSON.stringify(store, null, 2));
}
