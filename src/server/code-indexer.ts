import { createHash } from "node:crypto";
import {
  getParser,
  type TreeSitterNode,
} from "../detectors/tree-sitter-manager";
import { detectLanguage } from "../detectors/language-registry";
import { generateEmbeddings } from "./embedding-provider";
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
 * Tree-sitter AST node types for symbol definitions, mapped by language.
 * Each language grammar has different node type names for functions,
 * classes, and methods.
 *
 * Sources:
 * - https://tree-sitter.github.io/tree-sitter/
 * - Grammar node definitions in each tree-sitter-* package
 */
const LANGUAGE_SYMBOL_NODES: Record<string, string[]> = {
  // JavaScript / TypeScript
  javascript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "generator_function_declaration",
    "class_declaration",
  ],
  typescript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "generator_function_declaration",
    "class_declaration",
  ],
  // Python
  python: [
    "function_definition",
    "class_definition",
    "decorated_definition",
  ],
  // Go
  go: [
    "function_declaration",
    "method_declaration",
  ],
  // Rust
  rust: [
    "function_item",
    "struct_item",
    "impl_item",
    "enum_item",
  ],
  // Java
  java: [
    "method_declaration",
    "class_declaration",
  ],
  // Ruby
  ruby: [
    "method",
    "class",
    "module",
  ],
  // PHP
  php: [
    "function_definition",
    "class_declaration",
    "method_declaration",
  ],
}

/**
 * Default symbol node types when language is unknown.
 */
const DEFAULT_SYMBOL_NODES = [
  "function_declaration",
  "function_definition",
  "method_definition",
  "class_declaration",
  "function_item",
]

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
        const symbols = findSymbolNodes(root, language);

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
 * Uses language-specific node types for accurate matching.
 */
function findSymbolNodes(
  node: TreeSitterNode,
  language: string = "typescript",
): TreeSitterNode[] {
  const results: TreeSitterNode[] = [];

  const symbolTypes = LANGUAGE_SYMBOL_NODES[language] || DEFAULT_SYMBOL_NODES;

  if (symbolTypes.includes(node.type)) {
    results.push(node);
  }

  for (const child of node.children) {
    results.push(...findSymbolNodes(child, language));
  }

  return results;
}

/**
 * Extract the symbol name from a function/class definition node.
 * Handles naming patterns across all supported languages:
 * - name node: (JS/TS: function_declaration → name child)
 * - identifier node: (Go: func_declaration → identifier child, Java: method → identifier child)
 * - Go methods: (receiver) FuncName
 * - Python: 'def' or 'class' keyword
 * - Rust: 'fn' keyword
 * - Ruby: 'def' keyword
 */
function extractSymbolName(
  node: TreeSitterNode,
  _language: string,
): string | null {
  // Try name child (JS/TS, Python, Rust, PHP)
  for (const child of node.children) {
    if (child.type === "name") {
      return child.text;
    }
  }

  // Try identifier child (Go, Java, Ruby)
  for (const child of node.children) {
    if (child.type === "identifier") {
      return child.text;
    }
  }

  // Fallback: extract from the first line of text
  const firstLine = node.text.split("\n")[0] || "";

  // Language-specific keyword patterns
  const funcMatch = firstLine.match(
    /(?:function|class|def|fn|struct|enum|impl|module)\s+(\w+)/,
  )
  if (funcMatch) return funcMatch[1]

  // Go method: (receiver) FuncName(...
  const goMethodMatch = firstLine.match(/\([^)]*\)\s+(\w+)\s*\(/)
  if (goMethodMatch) return goMethodMatch[1]

  // Method shorthand or variable assignment: foo() { ... }
  const methodMatch = firstLine.match(/(\w+)\s*\(/)
  if (
    methodMatch &&
    !["if", "for", "while", "switch", "catch", "return"].includes(
      methodMatch[1],
    )
  ) {
    return methodMatch[1]
  }

  return null;
}

// ─── Embedding Provider ─────────────────────────────────────────
// Imported from embedding-provider.ts at the top of the file.

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
  const vectors = await generateEmbeddings([query]);
  if (vectors.length === 0) return [];
  const [queryVector] = vectors;

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
