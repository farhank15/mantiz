import { QdrantClient } from "@qdrant/js-client-rest";
import { getVectorSize } from "./embedding-provider";

// ─── Configuration ──────────────────────────────────────────────

// Qdrant Cloud provides CLUSTER_ENDPOINT; our code uses QDRANT_URL.
// Support both names so users don't have to rename the env var.
const RAW_QDRANT_URL =
  typeof process !== "undefined" ? (process.env.QDRANT_URL || process.env.CLUSTER_ENDPOINT) : undefined;
const QDRANT_API_KEY =
  typeof process !== "undefined" ? process.env.QDRANT_API_KEY : undefined;

const COLLECTION_PREFIX = "mantiz_code_";

let _client: QdrantClient | null = null;

/**
 * Get or initialize the Qdrant client singleton.
 */
export function getQdrantClient(): QdrantClient {
  if (!_client) {
    if (!RAW_QDRANT_URL || !QDRANT_API_KEY) {
      throw new Error(
        "Qdrant not configured. Set QDRANT_URL (or CLUSTER_ENDPOINT) and QDRANT_API_KEY environment variables.",
      );
    }
    _client = new QdrantClient({
      url: RAW_QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      // REST API is used (default) — works best with Vercel serverless
    });
  }
  return _client;
}

/**
 * Get the collection name for a specific repository.
 */
export function getCollectionName(repo: string): string {
  // Normalize: replace / with _, lowercase
  const normalized = repo.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `${COLLECTION_PREFIX}${normalized}`;
}

/**
 * Check if Qdrant is configured.
 */
export function isQdrantConfigured(): boolean {
  return !!(RAW_QDRANT_URL && QDRANT_API_KEY);
}

// ─── Collection Management ──────────────────────────────────────

/**
 * Ensure a collection exists for the given repo.
 * Creates it with the correct vector config if it doesn't exist.
 */
export async function ensureCollection(repo: string): Promise<void> {
  const client = getQdrantClient();
  const collectionName = getCollectionName(repo);

  const collections = await client.getCollections();
  const exists = collections.collections?.some(
    (c: any) => c.name === collectionName,
  );

  if (!exists) {
    await client.createCollection(collectionName, {
      vectors: {
        size: getVectorSize(),
        distance: "Cosine",
      },
      // HNSW index for fast approximate search
      hnsw_config: {
        m: 16,
        ef_construct: 100,
      },
      // Scalar quantization reduces memory by ~4x
      quantization_config: {
        scalar: {
          type: "int8",
          quantile: 0.99,
          always_ram: true,
        },
      },
    });

    // Create payload indexes for filtered fields
    await client.createPayloadIndex(collectionName, {
      field_name: "repo",
      field_schema: { type: "keyword" },
    });
    await client.createPayloadIndex(collectionName, {
      field_name: "filePath",
      field_schema: { type: "keyword" },
    });
    await client.createPayloadIndex(collectionName, {
      field_name: "symbolName",
      field_schema: { type: "keyword" },
    });
  }
}

// ─── Context Building ───────────────────────────────────────────

/**
 * Build a RAG context string from search results.
 * Formats as a readable code block that can be injected into AI prompts.
 */
export function buildRagContext(
  results: Array<{
    filePath: string;
    symbolName: string;
    content: string;
    startLine: number;
    score: number;
  }>,
  maxChars: number = 2000,
): string {
  if (results.length === 0) return "";

  let context = "## Relevant Code Definitions\n\n";
  let totalChars = context.length;

  for (const r of results) {
    const header = `### \`${r.symbolName}\` in \`${r.filePath}:${r.startLine}\` (score: ${(r.score * 100).toFixed(0)}%)\n`;
    const codeBlock = `\`\`\`\n${r.content}\n\`\`\`\n\n`;

    if (totalChars + header.length + codeBlock.length > maxChars) {
      context += `_... truncated (${results.length - 1} more results)_\n`;
      break;
    }

    context += header + codeBlock;
    totalChars += header.length + codeBlock.length;
  }

  return context;
}

/**
 * Search for code context relevant to a specific symbol name (matcher, function, etc).
 * Used to verify if a symbol exists in the codebase.
 */
export async function searchSymbol(
  symbolName: string,
  repo: string,
): Promise<{
  found: boolean;
  context: string;
  definition?: {
    filePath: string;
    startLine: number;
    content: string;
  };
}> {
  if (!isQdrantConfigured()) {
    return { found: false, context: "" };
  }

  try {
    const client = getQdrantClient();
    const collectionName = getCollectionName(repo);

    // Scroll by symbol name with exact match filter (no vector needed)
    const { points } = await client.scroll(collectionName, {
      limit: 5,
      filter: {
        must: [
          { key: "repo", match: { value: repo } },
          { key: "symbolName", match: { value: symbolName } },
        ],
      },
      with_payload: true,
    });

    if (points.length > 0) {
      const top = points[0];
      const payload = top.payload as any;

      const definition = {
        filePath: payload.filePath || "",
        startLine: payload.startLine || 0,
        content: payload.content || "",
      };

      return {
        found: true,
        context: buildRagContext([
          {
            filePath: definition.filePath,
            symbolName: payload.symbolName || symbolName,
            content: definition.content,
            startLine: definition.startLine,
            score: 1, // scroll = exact match, no relevance score
          },
        ]),
        definition,
      };
    }

    return { found: false, context: "" };
  } catch (err) {
    console.error("[code-rag] Search error:", err);
    return { found: false, context: "" };
  }
}

/**
 * Search for code context using a text query (semantic search).
 * Used to find relevant code when the exact symbol name is unknown.
 */
export async function searchQuery(
  queryText: string,
  repo: string,
): Promise<string> {
  if (!isQdrantConfigured()) {
    return "";
  }

  try {
    const { generateEmbeddings } = await import("./embedding-provider");
    const vectors = await generateEmbeddings([queryText]);
    if (vectors.length === 0) return ""
    const [queryVector] = vectors

    const client = getQdrantClient();
    const collectionName = getCollectionName(repo);

    const results = await client.search(collectionName, {
      vector: queryVector,
      limit: 5,
      filter: {
        must: [{ key: "repo", match: { value: repo } }],
      },
      with_payload: true,
    });

    const items = results.map((r) => ({
      filePath: (r.payload as any)?.filePath || "",
      symbolName: (r.payload as any)?.symbolName || "",
      content: (r.payload as any)?.content || "",
      startLine: (r.payload as any)?.startLine || 0,
      score: r.score || 0,
    }));

    return buildRagContext(items);
  } catch (err) {
    console.error("[code-rag] Search query error:", err);
    return "";
  }
}
