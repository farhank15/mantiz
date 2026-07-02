/**
 * Mantiz Tree-sitter AST Analyzer
 *
 * Two entry points:
 * 1. detectWithTreeSitter()       — SYNC, heuristic fallback for scanDiff()
 * 2. detectWithTreeSitterAsync()  — ASYNC, real Tree-sitter WASM for scanDiffAsync()
 *
 * The sync version uses indentation/brace-counting heuristics for all languages.
 * The async version uses Tree-sitter WASM parsers for supported languages
 * (Python verified, more to come).
 *
 * Patterns detected (language-agnostic):
 * 1. Trivial Function Body — body replaced with `pass` / `return true` / `nil`
 * 2. Empty Catch Block — try/except with empty/non-functional catch
 * 3. Conditional Wrapping — if(false) / if(0) blocks
 */

import type { Finding, ParsedDiff } from './types'
import { detectLanguage } from './language-registry'
import { parseWithTreeSitter, walkTree, type TreeSitterNode } from './tree-sitter-manager'

// ─── AST Finding Type ────────────────────────────────────────────

interface ASTFinding {
  type: 'trivial_function' | 'async_gutted' | 'conditional_wrap' | 'empty_test_shell'
  lineStart: number
  lineEnd: number
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  details: string
}

// ─── Language-Specific Node Type Maps ────────────────────────────

interface TreeNodeMap {
  functionDefinitions: string[]
  tryStatements: string[]
  catchClauses: string[]
  ifStatements: string[]
  blockTypes: string[]
}

const NODE_MAPS: Record<string, TreeNodeMap> = {
  python: {
    functionDefinitions: ['function_definition'],
    tryStatements: ['try_statement'],
    catchClauses: ['except_clause'],
    ifStatements: ['if_statement'],
    blockTypes: ['block'],
  },
  go: {
    functionDefinitions: ['function_declaration', 'method_declaration'],
    tryStatements: [],
    catchClauses: [],
    ifStatements: ['if_statement'],
    blockTypes: ['block'],
  },
  java: {
    functionDefinitions: ['method_declaration'],
    tryStatements: ['try_statement'],
    catchClauses: ['catch_clause'],
    ifStatements: ['if_statement'],
    blockTypes: ['block'],
  },
  ruby: {
    functionDefinitions: ['method'],
    tryStatements: ['begin'],
    catchClauses: ['rescue', 'rescue_clause'],
    ifStatements: ['if', 'unless'],
    blockTypes: ['body'],
  },
  rust: {
    functionDefinitions: ['function_item'],
    tryStatements: [],
    catchClauses: [],
    ifStatements: ['if_expression'],
    blockTypes: ['block'],
  },
  php: {
    functionDefinitions: ['function_definition'],
    tryStatements: ['try_statement'],
    catchClauses: ['catch_clause'],
    ifStatements: ['if_statement'],
    blockTypes: ['compound_statement'],
  },
}

function getNodeMap(lang: string): TreeNodeMap | null {
  return NODE_MAPS[lang] || null
}

// ─── Heuristic Fallback (SYNC) ───────────────────────────────────

const FALLBACK_FUNCTION_MARKERS: Record<string, RegExp[]> = {
  python: [/^\s*def\s+\w+\s*\(/],
  go: [/^\s*func\s+\w+\s*\(/],
  java: [/^\s*(?:public|private|protected)\s+\w+\s+\w+\s*\(/, /^\s*@\w+\s*$/],
  ruby: [/^\s*def\s+\w+/],
  rust: [/^\s*fn\s+\w+\s*\(/],
  php: [/^\s*(?:public|private|protected)?\s*function\s+\w+\s*\(/],
}

const BRACE_LANGUAGES = new Set(['go', 'java', 'rust', 'php'])

function findBlockEndByIndent(lines: string[], startIdx: number, baseIndent: number): number {
  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const indent = line.search(/\S/)
    if (indent < baseIndent) return j
  }
  return lines.length
}

function findBlockEnd(lines: string[], startIdx: number): number {
  const line = lines[startIdx].trim()
  if (line.includes('{')) {
    let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length
    for (let j = startIdx + 1; j < lines.length; j++) {
      braceCount += (lines[j].match(/{/g) || []).length
      braceCount -= (lines[j].match(/}/g) || []).length
      if (braceCount <= 0) return j
    }
  }
  return findBlockEndByIndent(lines, startIdx + 1, lines[startIdx].search(/\S/))
}

function fallbackAnalyze(filePath: string, codeLines: string): ASTFinding[] {
  const findings: ASTFinding[] = []
  const lang = detectLanguage(filePath)
  if (!lang) return []

  const lines = codeLines.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    const funcMarkers = FALLBACK_FUNCTION_MARKERS[lang]
    if (funcMarkers?.some(p => p.test(line))) {
      const funcIndent = line.search(/\S/)
      const usesBraces = BRACE_LANGUAGES.has(lang)
      const blockEnd = usesBraces
        ? findBlockEnd(lines, i)
        : findBlockEndByIndent(lines, i + 1, funcIndent + 1)

      if (blockEnd > i + 1) {
        const bodyLines: string[] = []
        for (let j = i + 1; j < blockEnd && j < lines.length; j++) {
          bodyLines.push(lines[j].trim())
        }

        const trivialPatterns: Record<string, RegExp[]> = {
          python: [/^pass$/, /^return\s+(?:True|False|None|0|\d+)$/],
          go: [/^return\s+(?:nil|true|false|0)$/],
          java: [/^return\s+(?:true|false|null|0);$/],
          ruby: [/^nil$/, /^true$/, /^false$/, /^return\s+(?:true|false|nil)$/],
          rust: [/^\s*$/, /^true$/, /^false$/, /^Ok\(\(\)\)$/],
          php: [/^return\s+(?:true|false|null|0);$/],
        }

        const patterns = trivialPatterns[lang]
        if (patterns && bodyLines.length <= 2 && bodyLines.some(l => patterns.some(p => p.test(l)))) {
          findings.push({
            type: 'trivial_function',
            lineStart: i + 1,
            lineEnd: blockEnd,
            confidence: 'high',
            explanation: 'Function body replaced with trivial implementation — indicates test logic was gutted.',
            details: `Function at line ${i + 1} returns trivial value unconditionally.`,
          })
        }
      }

      i = (blockEnd || i + 1)
      continue
    }

    if (/^\s*if\s*\(?\s*(?:false|0)\s*\)?\s*[:{]/.test(trimmed) ||
        /^\s*if\s+false/.test(trimmed)) {
      findings.push({
        type: 'conditional_wrap',
        lineStart: i + 1,
        lineEnd: findBlockEnd(lines, i),
        confidence: 'high',
        explanation: 'Code wrapped in if(false) block — will never execute.',
        details: `if(false) block at line ${i + 1}`,
      })
    }

    i++
  }

  return findings
}

// ─── Tree-sitter AST Analysis (ASYNC) ────────────────────────────

/**
 * Check if a function body consists of trivial statements.
 */
function tsIsTrivialBody(bodyNodes: TreeSitterNode[], lang: string): boolean {
  if (bodyNodes.length === 0) return true

  for (const stmt of bodyNodes) {
    const text = stmt.text?.trim() || ''

    if (lang === 'python' && /^(pass|return\s+(True|False|None|0|\d+)\s*)$/.test(text)) continue
    if (lang === 'go' && /^return\s+(nil|true|false|0)\s*$/.test(text)) continue
    if (lang === 'java' && /^return\s+(true|false|null|0);?$/.test(text)) continue
    if (lang === 'ruby' && /^(nil|true|false|return\s+(true|false|nil))\s*$/.test(text)) continue
    if (lang === 'rust' && /^(true|false|Ok\(\(\)\))\s*$/.test(text)) continue
    if (lang === 'php' && /^return\s+(true|false|null|0);?$/.test(text)) continue

    return false
  }

  return true
}

/**
 * Find the block child of a Tree-sitter node (last block-type child).
 */
function findBlockChild(node: TreeSitterNode, _nodeMap: TreeNodeMap): TreeSitterNode | null {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]
    if (child.children.length > 0 || child.childCount > 0) {
      return child
    }
  }
  return null
}

/**
 * Analyze a function definition for trivial body using Tree-sitter node types.
 */
function tsAnalyzeFunctionDef(funcNode: TreeSitterNode, lang: string, _nodeMap: TreeNodeMap): ASTFinding | null {
  const bodyBlock = findBlockChild(funcNode, _nodeMap)
  if (!bodyBlock) return null

  // Filter out comment/expression-only statements
  const bodyStatements = bodyBlock.children.filter(
    c => !c.type.startsWith('comment') && c.type !== 'expression_statement' && c.text?.trim(),
  )

  if (bodyStatements.length === 0) {
    return {
      type: 'empty_test_shell',
      lineStart: funcNode.startPosition.row + 1,
      lineEnd: funcNode.endPosition.row + 1,
      confidence: 'medium',
      explanation: 'Function body is empty — no meaningful logic, likely a placeholder.',
      details: `Function at line ${funcNode.startPosition.row + 1} has empty body.`,
    }
  }

  if (tsIsTrivialBody(bodyStatements, lang)) {
    const bodyText = bodyStatements.map(s => s.text || '').join('; ').substring(0, 80)
    return {
      type: 'trivial_function',
      lineStart: funcNode.startPosition.row + 1,
      lineEnd: funcNode.endPosition.row + 1,
      confidence: 'high',
      explanation: `Function body replaced with trivial implementation (${bodyText}) — indicates test logic was gutted.`,
      details: `Function at line ${funcNode.startPosition.row + 1} returns trivial value unconditionally.`,
    }
  }

  return null
}

/**
 * Analyze try/catch blocks for empty/non-functional catch using Tree-sitter AST.
 */
function tsAnalyzeTryCatch(tryNode: TreeSitterNode, lang: string, nodeMap: TreeNodeMap): ASTFinding | null {
  let catchNodes: TreeSitterNode[] = []

  // Find catch clauses by node type
  if (lang === 'python') {
    catchNodes = tryNode.children.filter(c => c.type === 'except_clause')
  } else if (lang === 'java' || lang === 'php') {
    catchNodes = tryNode.children.filter(c => c.type === 'catch_clause')
  } else if (lang === 'ruby') {
    catchNodes = tryNode.children.filter(c => c.type === 'rescue' || c.type === 'rescue_clause')
  }

  if (catchNodes.length === 0) return null

  for (const catchNode of catchNodes) {
    const catchBody = findBlockChild(catchNode, nodeMap)
    if (!catchBody) continue

    const bodyStatements = catchBody.children.filter(
      c => !c.type.startsWith('comment') && c.type !== 'expression_statement' && c.text?.trim(),
    )

    if (bodyStatements.length === 0) {
      return {
        type: 'async_gutted',
        lineStart: tryNode.startPosition.row + 1,
        lineEnd: tryNode.endPosition.row + 1,
        confidence: 'high',
        explanation: 'Empty catch/except block — errors are silently swallowed.',
        details: `Try at line ${tryNode.startPosition.row + 1} has empty catch.`,
      }
    }

    const isNonFunctional = bodyStatements.every(stmt => {
      const text = stmt.text?.trim() || ''
      if (lang === 'python' && /^(pass|print\s*\()/.test(text)) return true
      if (lang === 'java' && /^\/\/|^\/\*/.test(text)) return true
      if (lang === 'ruby' && /^print|^puts|^p\s/.test(text)) return true
      if (lang === 'php' && /^\/\/|^#/.test(text)) return true
      return false
    })

    if (isNonFunctional) {
      return {
        type: 'async_gutted',
        lineStart: tryNode.startPosition.row + 1,
        lineEnd: tryNode.endPosition.row + 1,
        confidence: 'high',
        explanation: 'Non-functional catch/except block — errors are silently swallowed.',
        details: `Try at line ${tryNode.startPosition.row + 1} has non-functional catch.`,
      }
    }
  }

  return null
}

/**
 * Analyze if statements for false/0 condition using Tree-sitter AST.
 */
function tsAnalyzeConditionalWrap(ifNode: TreeSitterNode, _lang: string, _nodeMap: TreeNodeMap): ASTFinding | null {
  if (ifNode.children.length < 2) return null

  const condition = ifNode.children[0]
  const conditionText = condition.text?.trim() || ''

  if (/^(false|0|False|null|None)\s*$/.test(conditionText) ||
      /^\(?\s*(false|0|False|null|None)\s*\)?\s*$/.test(conditionText)) {
    return {
      type: 'conditional_wrap',
      lineStart: ifNode.startPosition.row + 1,
      lineEnd: ifNode.endPosition.row + 1,
      confidence: 'high',
      explanation: 'Code wrapped in if(false/0) block — will never execute.',
      details: `Conditional at line ${ifNode.startPosition.row + 1} evaluates to false.`,
    }
  }

  return null
}

/**
 * Run full Tree-sitter analysis on a code block.
 * This is ASYNC — it loads WASM parsers on demand.
 */
async function analyzeWithTreeSitterAsync(code: string, lang: string): Promise<ASTFinding[]> {
  const nodeMap = getNodeMap(lang)
  if (!nodeMap) return []

  const tree = await parseWithTreeSitter(code, lang)
  if (!tree || !tree.rootNode) return []

  const findings: ASTFinding[] = []
  const root = tree.rootNode

  // Walk the AST collecting findings
  const allNodes = walkTree(root, () => true)

  for (const node of allNodes) {
    // Check function definitions
    if (nodeMap.functionDefinitions.includes(node.type)) {
      const finding = tsAnalyzeFunctionDef(node, lang, nodeMap)
      if (finding) findings.push(finding)
    }

    // Check try/catch blocks
    if (nodeMap.tryStatements.includes(node.type)) {
      const finding = tsAnalyzeTryCatch(node, lang, nodeMap)
      if (finding) findings.push(finding)
    }

    // Check conditionals
    if (nodeMap.ifStatements.includes(node.type)) {
      const finding = tsAnalyzeConditionalWrap(node, lang, nodeMap)
      if (finding) findings.push(finding)
    }
  }

  return findings
}

// ─── Entry Point: SYNC (Heuristic) ───────────────────────────────

/**
 * Run multi-language analysis using heuristic fallback.
 *
 * SYNC — safe for scanDiff() hot path.
 * Uses indentation/brace-counting heuristics for Python, Go, Java, Ruby, Rust, PHP.
 * For true AST-aware analysis, use detectWithTreeSitterAsync().
 */
export function detectWithTreeSitter(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const JS_TS_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (JS_TS_EXT.test(filePath)) continue // JS/TS handled by Babel (ast-analyzer.ts)

    const lang = detectLanguage(filePath)
    if (!lang) continue

    for (const hunk of file.hunks) {
      const lines = hunk.content.split('\n')
      const codeLines = lines
        .filter(l => l.startsWith('+') && !l.startsWith('+++'))
        .map(l => l.slice(1))
        .join('\n')

      if (codeLines.trim().length < 10) continue

      const astFindings = fallbackAnalyze(filePath, codeLines)

      for (const af of astFindings) {
        let patternType: string
        switch (af.type) {
          case 'trivial_function':
          case 'empty_test_shell':
          case 'conditional_wrap':
            patternType = 'disabled_assertion'
            break
          case 'async_gutted':
            patternType = 'silent_catch_and_pass'
            break
          default:
            patternType = 'disabled_assertion'
        }

        findings.push({
          patternType: patternType as any,
          filePath,
          lineStart: af.lineStart,
          lineEnd: af.lineEnd,
          confidence: af.confidence,
          explanation: `📐 ${af.explanation} [${lang.toUpperCase()} heuristic]`,
          evidenceExcerpt: af.details.substring(0, 200),
        })
      }
    }
  }

  return findings
}

// ─── Entry Point: ASYNC (Tree-sitter WASM) ───────────────────────

/**
 * Run multi-language analysis using real Tree-sitter WASM parsers.
 *
 * ASYNC — loads WASM files on demand (CDN + filesystem fallback).
 * For Python (verified): true AST-level analysis.
 * For other languages: falls back to detectWithTreeSitter() heuristic.
 *
 * Caches parsers after first load — subsequent calls are fast.
 */
export async function detectWithTreeSitterAsync(files: ParsedDiff[]): Promise<Finding[]> {
  const findings: Finding[] = []
  const JS_TS_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i

  // Group files by language for batch parser loading
  const filesByLang = new Map<string, ParsedDiff[]>()

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (JS_TS_EXT.test(filePath)) continue

    const lang = detectLanguage(filePath)
    if (!lang) continue

    const arr = filesByLang.get(lang) || []
    arr.push(file)
    filesByLang.set(lang, arr)
  }

  // Process each language group
  // Only process languages WITH Tree-sitter node maps.
  // All 6 supported languages now have verified WASM.
  // Falls back to sync heuristic only on load failure.
  for (const [lang, langFiles] of filesByLang) {
    const nodeMap = getNodeMap(lang)
    if (!nodeMap) {
      // Skip — sync detectWithTreeSitter already handled heuristic for this language
      continue
    }

    for (const file of langFiles) {
      const filePath = file.newFile || file.oldFile || 'unknown'

      for (const hunk of file.hunks) {
        const lines = hunk.content.split('\n')
        const codeLines = lines
          .filter(l => l.startsWith('+') && !l.startsWith('+++'))
          .map(l => l.slice(1))
          .join('\n')

        if (codeLines.trim().length < 10) continue

        // Try Tree-sitter first
        let astFindings: ASTFinding[]
        try {
          astFindings = await analyzeWithTreeSitterAsync(codeLines, lang)
        } catch {
          astFindings = []
        }

        // Fall back to heuristic if Tree-sitter returned nothing
        if (astFindings.length === 0) {
          astFindings = fallbackAnalyze(filePath, codeLines)
        }

        for (const af of astFindings) {
          let patternType: string
          switch (af.type) {
            case 'trivial_function':
            case 'empty_test_shell':
            case 'conditional_wrap':
              patternType = 'disabled_assertion'
              break
            case 'async_gutted':
              patternType = 'silent_catch_and_pass'
              break
            default:
              patternType = 'disabled_assertion'
          }

          findings.push({
            patternType: patternType as any,
            filePath,
            lineStart: af.lineStart,
            lineEnd: af.lineEnd,
            confidence: af.confidence,
            explanation: `🌳 ${af.explanation} [${lang.toUpperCase()} TS]`,
            evidenceExcerpt: af.details.substring(0, 200),
          })
        }
      }
    }
  }

  return findings
}
