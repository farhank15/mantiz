import { createHash } from "node:crypto";
import {
  getParser,
  type TreeSitterNode,
} from "../detectors/tree-sitter-manager";
import { detectLanguage } from "../detectors/language-registry";
import { getQdrantClient, getCollectionName } from "./code-rag";

// ─── Types ──────────────────────────────────────────────────────

export interface CodeChunk {
  /** Unique content hash */
  id: string;
  /** File path relative to repo root */
  filePath: string;
  /** Programming language */
  language: string;
  /** Repository full name (e.g. "owner/repo") */
  repo: string;
  /** Symbol name (function/class/variable name) */
  symbolName: string;
  /** Symbol type: function, class, method, arrow_function */
  symbolType: string;
  /** Full source code of the chunk */
  content: string;
  /** Start line number (1-based) */
  startLine: number;
  /** End line number (1-based) */
  endLine: number;
  /** SHA-256 hash of content for change detection */
  contentHash: string;
  /** Embedding vector (set after API call) */
  vector?: number[];
}

// ─── Tree-sitter Chunking ───────────────────────────────────────

/**
 * JavaScript/TypeScript function name patterns (heuristic, not AST)
 * Tree-sitter for JS/TS uses 'function_declaration', 'method_definition',
 * 'arrow_function', 'generator_function_declaration'
 */
const SYMBOL_NODE_TYPES = [
  "function_declaration",
  "method_definition",
  "arrow_function",
  "generator_function_declaration",
  "class_declaration",
  "class",
];

/**
 * Extract code chunks from a file using Tree-sitter AST.
 * Falls back to simple line-based extraction if Tree-sitter unavailable.
 */
export async function chunkFile(
  code: string,
  filePath: string,
  repo: string,
): Promise<CodeChunk[]> {
  const language = detectLanguage(filePath) || "typescript";
  const chunks: CodeChunk[] = [];

  // Try Tree-sitter AST parsing first
  try {
    const parser = await getParser(language);
    if (parser) {
      const tree = parser.parse(code);
      if (tree && tree.rootNode) {
        const root = simplifyNode(tree.rootNode);
        const symbols = findSymbolNodes(root);

        for (const node of symbols) {
          const name = extractSymbolName(node, language);
          if (!name) continue;

          const content = code.slice(
            node.startPosition.row,
            node.endPosition.row + 1,
          );

          const chunk: CodeChunk = {
            id: `${repo}:${filePath}:${name}`,
            filePath,
            language,
            repo,
            symbolName: name,
            symbolType: node.type,
            content,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            contentHash: createHash("sha256").update(content).digest("hex"),
          };
          chunks.push(chunk);
        }
      }
    }
  } catch {
    // Tree-sitter failed — fall through to heuristic
  }

  // Fallback: line-based chunking if Tree-sitter returned nothing
  if (chunks.length === 0) {
    const lines = code.split("\n");
    let currentName = `file_${filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
    let startLine = 1;

    // Simple heuristic: treat whole file as one chunk
    const chunk: CodeChunk = {
      id: `${repo}:${filePath}:root`,
      filePath,
      language,
      repo,
      symbolName: currentName,
      symbolType: "file",
      content: code,
      startLine,
      endLine: lines.length,
      contentHash: createHash("sha256").update(code).digest("hex"),
    };
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Simplify a Tree-sitter node to our interface.
 */
function simplifyNode(node: any): TreeSitterNode {
  const children: TreeSitterNode[] = [];
  for (let i = 0; i < (node.childCount || 0); i++) {
    const child = node.child(i);
    if (child) {
      children.push(simplifyNode(child));
    }
  }
  return {
    type: node.type,
    text: node.text || "",
    startPosition: node.startPosition || { row: 0, column: 0 },
    endPosition: node.endPosition || { row: 0, column: 0 },
    children,
    childCount: children.length,
  };
}

/**
 * Find all symbol definition nodes (functions, classes, methods) in the tree.
 */
function findSymbolNodes(node: TreeSitterNode): TreeSitterNode[] {
  const results: TreeSitterNode[] = [];

  if (SYMBOL_NODE_TYPES.includes(node.type)) {
    results.push(node);
  }

  for (const child of node.children) {
    results.push(...findSymbolNodes(child));
  }

  return results;
}

/**
 * Extract the symbol name from a function/class definition node.
 */
function extractSymbolName(
  node: TreeSitterNode,
  _language: string,
): string | null {
  // Try to find the name child node
  for (const child of node.children) {
    if (child.type === "name") {
      return child.text;
    }
  }

  // Fallback: extract from the first line of text
  const firstLine = node.text.split("\n")[0] || "";
  const funcMatch = firstLine.match(/(?:function|class|def|fn)\s+(\w+)/);
  if (funcMatch) return funcMatch[1];

  // Method shorthand: { foo() { ... } }
  const methodMatch = firstLine.match(/(\w+)\s*\(/);
  if (
    methodMatch &&
    !["if", "for", "while", "switch", "catch"].includes(methodMatch[1])
  ) {
    return methodMatch[1];
  }

  return null;
}

// ─── Embedding Generation ───────────────────────────────────────

const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Check if OpenAI embedding API is configured.
 */
export function isEmbeddingConfigured(): boolean {
  return (
    typeof process !== "undefined" && !!process.env.OPENAI_API_KEY
  );
}

/**
 * Generate embeddings for an array of text chunks via OpenAI API.
 * Batches up to 20 chunks per request.
 * Returns empty array if OpenAI is not configured.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey =
    typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined;

  if (!apiKey) {
    console.warn('[code-indexer] OPENAI_API_KEY not configured — skipping embeddings')
    return []
  }

  const embeddings: number[][] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embedding API error: ${res.status}`);
    }

    const data = (await res.json()) as EmbeddingResponse;
    const batchEmbeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

// ─── Index Orchestration ─────────────────────────────────────────

/**
 * Index a single file: chunk → embed → upsert to Qdrant.
 */
export async function indexFile(
  code: string,
  filePath: string,
  repo: string,
): Promise<CodeChunk[]> {
  const chunks = await chunkFile(code, filePath, repo);
  if (chunks.length === 0) return [];

  // Ensure Qdrant collection exists before upsert
  const { ensureCollection } = await import('./code-rag')
  await ensureCollection(repo)

  // Generate embeddings
  const texts = chunks.map((c) => c.content);
  const vectors = await generateEmbeddings(texts);

  // Gracefully handle missing embeddings (OpenAI not configured)
  if (vectors.length === 0) return chunks

  // Attach vectors to chunks
  for (let i = 0; i < chunks.length; i++) {
    chunks[i].vector = vectors[i];
  }

  // Upsert to Qdrant
  const client = getQdrantClient();
  const collectionName = getCollectionName(repo);

  const points = chunks.map((c) => ({
    id: c.id,
    vector: c.vector!,
    payload: {
      filePath: c.filePath,
      language: c.language,
      repo: c.repo,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      content: c.content.slice(0, 8000), // Limit payload size
      startLine: c.startLine,
      endLine: c.endLine,
      contentHash: c.contentHash,
    },
  }));

  // Batch upsert (max 100 points per request)
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    await client
      .upsert(collectionName, {
        wait: true,
        points: batch,
      })
      .catch((err) => {
        console.error(`[code-indexer] Qdrant upsert error:`, err);
      });
  }

  return chunks;
}

/**
 * Delete indexed chunks for a file (when file is deleted).
 */
export async function deleteFileIndex(
  filePath: string,
  repo: string,
): Promise<void> {
  const client = getQdrantClient();
  const collectionName = getCollectionName(repo);

  await client
    .delete(collectionName, {
      wait: true,
      filter: {
        must: [{ key: "filePath", match: { value: filePath } }],
      },
    })
    .catch(() => {});
}

/**
 * Search for relevant code chunks given a query text.
 * Used at scan time to find definitions of unknown matchers/functions.
 */
export async function searchCode(
  query: string,
  repo: string,
  limit: number = 5,
): Promise<Array<{ chunk: CodeChunk; score: number }>> {
  const client = getQdrantClient();
  const collectionName = getCollectionName(repo);

  // Generate embedding for the query
  const [queryVector] = await generateEmbeddings([query]);

  // Search Qdrant with filter on repo
  const results = await client.search(collectionName, {
    vector: queryVector,
    limit,
    filter: {
      must: [{ key: "repo", match: { value: repo } }],
    },
    with_payload: true,
  });

  return results.map((r) => ({
    chunk: {
      id: r.id as string,
      filePath: (r.payload as any)?.filePath || "",
      language: (r.payload as any)?.language || "",
      repo: (r.payload as any)?.repo || repo,
      symbolName: (r.payload as any)?.symbolName || "",
      symbolType: (r.payload as any)?.symbolType || "",
      content: (r.payload as any)?.content || "",
      startLine: (r.payload as any)?.startLine || 0,
      endLine: (r.payload as any)?.endLine || 0,
      contentHash: (r.payload as any)?.contentHash || "",
    },
    score: r.score || 0,
  }));
}
