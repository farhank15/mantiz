/**
 * Mantiz Tree-sitter Manager
 *
 * Manages loading and caching of Tree-sitter WASM language parsers.
 * Loads from CDN first (jsdelivr), falls back to filesystem (node_modules).
 *
 * Supported languages:
 * - Python (proof of concept)
 * - More languages can be added by adding WASM file URLs/paths
 *
 * Gracefully degrades if WASM cannot be loaded — returns null and caller
 * falls back to heuristic analysis.
 */

import { Parser, Language } from 'web-tree-sitter'

// ─── Types ───────────────────────────────────────────────────────

export interface TreeSitterNode {
  type: string
  text: string
  startPosition: { row: number; column: number }
  endPosition: { row: number; column: number }
  children: TreeSitterNode[]
  childCount: number
}

export interface TreeSitterTree {
  rootNode: TreeSitterNode
}

// ─── Language Config ─────────────────────────────────────────────

interface LanguageWasmConfig {
  /** CDN URL for loading the WASM file */
  cdnUrl: string
  /** Local filesystem path for CLI fallback */
  localPath: string
  /** Whether this language is verified to work */
  verified: boolean
}

const LANGUAGE_WASM: Record<string, LanguageWasmConfig> = {
  python: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-python@0.23.6/tree-sitter-python.wasm',
    localPath: 'node_modules/tree-sitter-python/tree-sitter-python.wasm',
    verified: true,
  },
  go: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-go@0.25.0/tree-sitter-go.wasm',
    localPath: 'node_modules/tree-sitter-go/tree-sitter-go.wasm',
    verified: true,
  },
  java: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-java@0.23.5/tree-sitter-java.wasm',
    localPath: 'node_modules/tree-sitter-java/tree-sitter-java.wasm',
    verified: true,
  },
  ruby: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-ruby@0.23.1/tree-sitter-ruby.wasm',
    localPath: 'node_modules/tree-sitter-ruby/tree-sitter-ruby.wasm',
    verified: true,
  },
  rust: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-rust@0.24.0/tree-sitter-rust.wasm',
    localPath: 'node_modules/tree-sitter-rust/tree-sitter-rust.wasm',
    verified: true,
  },
  php: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-php@0.24.2/tree-sitter-php.wasm',
    localPath: 'node_modules/tree-sitter-php/tree-sitter-php.wasm',
    verified: true,
  },
  typescript: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm',
    localPath: 'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
    verified: true,
  },
  javascript: {
    cdnUrl: 'https://cdn.jsdelivr.net/npm/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm',
    localPath: 'node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm',
    verified: true,
  },
}

// ─── Cached Parsers ──────────────────────────────────────────────

const parserCache = new Map<string, Language>()

/**
 * Initialize the Tree-sitter WASM runtime.
 * Must be called once before any language loading.
 */
let initialized = false

async function ensureInit(): Promise<boolean> {
  if (initialized) return true
  try {
    await Parser.init()
    initialized = true
    return true
  } catch (err) {
    console.warn('[Mantiz] Tree-sitter init failed:', err)
    return false
  }
}

/**
 * Load a Tree-sitter language parser.
 * Tries CDN first, falls back to local filesystem.
 * Returns null if language is not configured or WASM cannot be loaded.
 */
async function loadLanguage(lang: string): Promise<Language | null> {
  if (parserCache.has(lang)) return parserCache.get(lang)!

  const config = LANGUAGE_WASM[lang]
  if (!config) return null

  try {
    // Try CDN first
    const langObj = await Language.load(config.cdnUrl)
    parserCache.set(lang, langObj as unknown as Language)
    return langObj as unknown as Language
  } catch {
    // Fallback to local filesystem
    try {
      const langObj = await Language.load(config.localPath)
      parserCache.set(lang, langObj as unknown as Language)
      return langObj as unknown as Language
    } catch {
      return null
    }
  }
}

/**
 * Get a Tree-sitter parser for a specific language.
 * Returns null if language is not available.
 */
export async function getParser(lang: string): Promise<Parser | null> {
  const ready = await ensureInit()
  if (!ready) return null

  const langObj = await loadLanguage(lang)
  if (!langObj) return null

  const parser = new Parser()
  parser.setLanguage(langObj)
  return parser
}

/**
 * Parse source code and return a simplified Tree-sitter tree.
 * Falls back gracefully if parser is unavailable for this language.
 */
export async function parseWithTreeSitter(
  code: string,
  lang: string,
): Promise<TreeSitterTree | null> {
  try {
    const parser = await getParser(lang)
    if (!parser) return null

    const tree = parser.parse(code)
    if (!tree) return null

    const rootNode = simplifyNode(tree.rootNode)
    return { rootNode }
  } catch {
    return null
  }
}

/**
 * Simplify a Tree-sitter node to our interface.
 */
function simplifyNode(node: any): TreeSitterNode {
  const children: TreeSitterNode[] = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      children.push(simplifyNode(child))
    }
  }

  return {
    type: node.type,
    text: node.text || '',
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children,
    childCount: children.length,
  }
}

/**
 * Walk a Tree-sitter tree and collect nodes matching a predicate.
 */
export function walkTree(
  node: TreeSitterNode,
  predicate: (n: TreeSitterNode) => boolean,
  results: TreeSitterNode[] = [],
): TreeSitterNode[] {
  if (predicate(node)) {
    results.push(node)
  }
  for (const child of node.children) {
    walkTree(child, predicate, results)
  }
  return results
}

/**
 * Find all nodes of a specific type in the tree.
 */
export function findNodesOfType(
  node: TreeSitterNode,
  typeName: string,
): TreeSitterNode[] {
  return walkTree(node, n => n.type === typeName)
}

/**
 * Check if a language has Tree-sitter WASM support configured.
 */
export function hasTreeSitterSupport(lang: string): boolean {
  return LANGUAGE_WASM[lang]?.verified === true
}

/**
 * Get the list of languages with verified Tree-sitter support.
 */
export function getSupportedLanguages(): string[] {
  return Object.entries(LANGUAGE_WASM)
    .filter(([_, config]) => config.verified)
    .map(([lang]) => lang)
}
