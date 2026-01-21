export function chunkText(
  input: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const text = (input ?? "").trim();
  if (!text) return [];

  const effectiveChunkSize = Math.max(1, chunkSize);
  const effectiveOverlap = Math.max(0, Math.min(chunkOverlap, effectiveChunkSize - 1));

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + effectiveChunkSize);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - effectiveOverlap;
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sha256(input: string): string {
  return fnv1aHex(input);
}

export function newId(): string {
  const g: any = globalThis as any;
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  const rnd = () => Math.floor(Math.random() * 0xffffffff);
  const a = rnd();
  const b = rnd();
  const c = rnd();
  const d = rnd();
  return (
    a.toString(16).padStart(8, "0") +
    "-" +
    (b >>> 16).toString(16).padStart(4, "0") +
    "-" +
    (b & 0xffff).toString(16).padStart(4, "0") +
    "-" +
    (c >>> 16).toString(16).padStart(4, "0") +
    "-" +
    (c & 0xffff).toString(16).padStart(4, "0") +
    d.toString(16).padStart(8, "0")
  );
}

export function extractKeywords(text: string): string[] {
  const normalized = (text ?? "").toLowerCase();
  const tokens: string[] = [];

  const wordMatches = normalized.match(/[a-z0-9]+/g) ?? [];
  tokens.push(...wordMatches);

  const cjkMatches = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjkMatches) {
    if (seg.length === 1) {
      tokens.push(seg);
      continue;
    }
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
  }

  return Array.from(new Set(tokens)).filter((t) => t.length >= 2);
}

export function keywordScore(query: string, text: string): number {
  const q = extractKeywords(query);
  if (q.length === 0) return 0;
  const t = new Set(extractKeywords(text));
  let hit = 0;
  for (const token of q) {
    if (t.has(token)) hit++;
  }
  return hit / q.length;
}
