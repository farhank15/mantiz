/**
 * Mantiz AST Analyzer
 *
 * Uses @swc/core (Rust-based, 20-100x faster than @babel/parser) to parse
 * TypeScript/JavaScript code into an AST and detect cheating patterns.
 *
 * For multi-language analysis (Python, Go, Java, Ruby, Rust, PHP),
 * see tree-sitter-analyzer.ts which provides Tree-sitter based parsing.
 *
 * Patterns detected:
 * 1. Trivial Function Body — function body replaced with `return true;` / `return false;`
 * 2. Async Function Gutting — async function wrapped in try/catch that always returns success
 * 3. Conditional Wrapping — entire test body wrapped in if/switch condition
 * 4. Assertion Removal at Block Level — expect/assert calls stripped from test blocks
 * 5. Empty Test Shell — describe/it block with no meaningful assertions
 */

import type swc from '@swc/core'
import type { Finding, ParsedDiff } from './types'

let _swc: typeof swc | null = null
let _swcLoaded = false
function getSwc(): typeof swc | null {
  if (!_swcLoaded) {
    _swcLoaded = true
    try {
      // Dynamic require for Node.js only — browser never loads this
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _swc = require('@swc/core')
    } catch {
      _swc = null
    }
  }
  return _swc
}

// ─── AST Finding Types ──────────────────────────────────────────

interface ASTFinding {
  type: 'trivial_function' | 'async_gutted' | 'conditional_wrap' | 'empty_test_shell' | 'stripped_assertions'
  lineStart: number
  lineEnd: number
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  details: string
}

// ─── AST Walking ────────────────────────────────────────────────

function walkAST(node: Record<string, unknown>, findings: ASTFinding[]): void {
  if (!node || typeof node !== 'object') return
  const type = node.type as string

  switch (type) {
    case 'FnDecl':
    case 'FnExpr':
    case 'ArrowExpr':
    case 'ClassMethod':
    case 'ObjectMethod':
      analyzeFunction(node, findings)
      break
    case 'TryStmt':
      analyzeTryStatement(node, findings)
      break
    case 'IfStmt':
      analyzeIfStatement(node, findings)
      break
    case 'SwitchStmt':
      analyzeSwitchStatement(node, findings)
      break
  }

  // Recursively walk all child nodes (skip span/loc metadata)
  for (const key of Object.keys(node)) {
    if (key === 'span' || key === 'loc' || key === 'start' || key === 'end') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in (item as object)) {
          walkAST(item as Record<string, unknown>, findings)
        }
      }
    } else if (child && typeof child === 'object' && 'type' in (child as object)) {
      walkAST(child as Record<string, unknown>, findings)
    }
  }
}

function getSpan(node: Record<string, unknown>): { start: number; end: number } {
  const span = node.span as { start: number; end: number } | undefined
  return span ?? { start: 0, end: 0 }
}

function analyzeFunction(node: Record<string, unknown>, findings: ASTFinding[]): void {
  let body: Record<string, unknown> | undefined
  const type = node.type as string

  if (type === 'ArrowExpr') {
    body = node.body as Record<string, unknown> | undefined
  } else {
    // FnDecl / FnExpr — function body is in .function.body
    const func = node.function as Record<string, unknown> | undefined
    body = func?.body as Record<string, unknown> | undefined
  }

  if (!body) return

  let stmts: Record<string, unknown>[]
  if (body.type === 'BlockStmt') {
    stmts = (body.stmts as Record<string, unknown>[]) ?? []
  } else {
    stmts = [body]
  }

  const span = getSpan(node)

  // Trivial return: function body is just `return true/false/null/undefined`
  if (stmts.length === 1 && stmts[0].type === 'ReturnStmt') {
    const ret = stmts[0]
    const arg = ret.argument as Record<string, unknown> | null
    if (arg && ['Bool', 'Null', 'Ident'].includes(arg.type as string)) {
      let value: string
      if (arg.type === 'Bool') {
        value = String((arg as Record<string, unknown>).value)
      } else if (arg.type === 'Null') {
        value = 'null'
      } else {
        const name = (arg as Record<string, unknown>).sym as string
        if (name !== 'undefined' && name !== 'void') return
        value = name
      }

      findings.push({
        type: 'trivial_function',
        lineStart: span.start,
        lineEnd: span.end,
        confidence: 'high',
        explanation: `Function body replaced with trivial return (${value}) — indicates test logic was gutted.`,
        details: `Function at line ${span.start} returns ${value} unconditionally.`,
      })
    }
  }

  // Async gutting: function body is just try/catch with empty catch
  if (stmts.length === 1 && stmts[0].type === 'TryStmt') {
    const tryStmt = stmts[0]
    const handler = tryStmt.handler as Record<string, unknown> | null
    if (handler) {
      const catchBody = (handler.body as Record<string, unknown>).stmts as Record<string, unknown>[] | undefined
      const hasTrivialCatch = !catchBody || catchBody.length <= 1

      if (hasTrivialCatch) {
        findings.push({
          type: 'async_gutted',
          lineStart: span.start,
          lineEnd: span.end,
          confidence: 'high',
          explanation: 'Function body consists solely of a try/catch with empty/silent catch — all errors are swallowed.',
          details: `Function at line ${span.start} wraps logic in try/catch with no error handling.`,
        })
      }
    }
  }

  // Empty shell: function body is empty or contains only an identifier expression
  if (stmts.length === 0 || (stmts.length === 1 && stmts[0].type === 'ExprStmt' &&
    (stmts[0].expression as Record<string, unknown>)?.type === 'Ident')) {
    findings.push({
      type: 'empty_test_shell',
      lineStart: span.start,
      lineEnd: span.end,
      confidence: 'medium',
      explanation: 'Function body is empty or contains no meaningful logic — likely a placeholder.',
      details: `Function at line ${span.start} has no meaningful body.`,
    })
  }
}

function analyzeTryStatement(node: Record<string, unknown>, findings: ASTFinding[]): void {
  const handler = node.handler as Record<string, unknown> | null
  if (!handler) return

  const catchStmts = (handler.body as Record<string, unknown>).stmts as Record<string, unknown>[] | undefined
  const span = getSpan(node)

  if (!catchStmts) return

  const isEmptyCatch = catchStmts.length === 0
  const hasCommentOnly = catchStmts.length === 1 && catchStmts[0].type === 'ExprStmt'

  if (isEmptyCatch || hasCommentOnly) {
    findings.push({
      type: 'async_gutted',
      lineStart: span.start,
      lineEnd: span.end,
      confidence: 'high',
      explanation: isEmptyCatch
        ? 'Empty catch block detected via AST — no error handling logic at all.'
        : 'Catch block contains only comments — errors are silently swallowed.',
      details: `Try/catch at line ${span.start} has ${isEmptyCatch ? 'empty' : 'comment-only'} catch body.`,
    })
  }
}

function analyzeIfStatement(node: Record<string, unknown>, findings: ASTFinding[]): void {
  const test = node.test as Record<string, unknown> | undefined
  const span = getSpan(node)
  if (!test) return

  if (test.type === 'Bool' && (test as Record<string, unknown>).value === false) {
    findings.push({
      type: 'conditional_wrap',
      lineStart: span.start,
      lineEnd: span.end,
      confidence: 'high',
      explanation: 'Code wrapped in if(false) block — will never execute. Tests inside this block are permanently disabled.',
      details: `if(false) block at line ${span.start}`,
    })
  }

  if (test.type === 'Num' && (test as Record<string, unknown>).value === 0) {
    findings.push({
      type: 'conditional_wrap',
      lineStart: span.start,
      lineEnd: span.end,
      confidence: 'high',
      explanation: 'Code wrapped in if(0) block — will never execute. This is a known AI agent evasion pattern.',
      details: `if(0) block at line ${span.start}`,
    })
  }

  if (test.type === 'CallExpr' || test.type === 'UnaryExpr' || test.type === 'MemberExpr') {
    const testStr = codeFromNode(test).substring(0, 80)
    if (/skip|SKIP|disable|DISABLE|bypass|BYPASS|mock/.test(testStr)) {
      findings.push({
        type: 'conditional_wrap',
        lineStart: span.start,
        lineEnd: span.end,
        confidence: 'medium',
        explanation: `Code conditionally wrapped — condition references "skip/disable/bypass" semantics at AST level.`,
        details: `Conditional at line ${span.start}: ${testStr}`,
      })
    }
  }
}

function analyzeSwitchStatement(node: Record<string, unknown>, findings: ASTFinding[]): void {
  const span = getSpan(node)
  const cases = node.cases as Record<string, unknown>[] | undefined
  if (!cases || cases.length === 0) return

  const defaultCase = cases.find((c: Record<string, unknown>) => c.test === null || c.test === undefined)
  if (defaultCase) {
    const consequent = (defaultCase.consequent as Record<string, unknown>[]) ?? []
    if (consequent.length <= 1) {
      findings.push({
        type: 'conditional_wrap',
        lineStart: span.start,
        lineEnd: span.end,
        confidence: 'medium',
        explanation: 'Switch statement with trivial default case — may be used to bypass test execution.',
        details: `Switch at line ${span.start}`,
      })
    }
  }
}

function codeFromNode(node: Record<string, unknown>): string {
  if (!node) return ''
  switch (node.type as string) {
    case 'Ident':
      return (node.sym as string) || ''
    case 'MemberExpr': {
      const obj = codeFromNode(node.obj as Record<string, unknown>)
      const prop = codeFromNode(node.prop as Record<string, unknown>)
      return `${obj}.${prop}`
    }
    case 'CallExpr': {
      const callee = codeFromNode(node.callee as Record<string, unknown>)
      const args = ((node.arguments as Record<string, unknown>[]) || [])
        .map((a: Record<string, unknown>) => {
          const expr = a.expression as Record<string, unknown> | undefined
          return codeFromNode(expr || a)
        })
        .join(', ')
      return `${callee}(${args})`
    }
    case 'UnaryExpr': {
      const op = node.op as string
      const arg = codeFromNode(node.argument as Record<string, unknown>)
      return `${op} ${arg}`
    }
    case 'Str':
      return `'${(node.value as string) || ''}'`
    case 'Bool':
      return String((node.value as boolean))
    case 'Num':
      return String((node.value as number))
    default:
      return `[${node.type as string}]`
  }
}

// ─── Hunk Parsing ────────────────────────────────────────────────

function extractAddedCode(hunkContent: string): { code: string; lineOffset: number }[] {
  const results: { code: string; lineOffset: number }[] = []
  const lines = hunkContent.split('\n')
  let currentBlock = ''
  let currentOffset = 0
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const code = line.slice(1)
      if (!currentBlock) currentOffset = i
      currentBlock += code + '\n'
      inBlock = true
    } else if (inBlock) {
      if (currentBlock.trim()) results.push({ code: currentBlock.trim(), lineOffset: currentOffset })
      currentBlock = ''
      inBlock = false
    }
  }
  if (inBlock && currentBlock.trim()) results.push({ code: currentBlock.trim(), lineOffset: currentOffset })
  return results
}

function analyzeHunk(hunkContent: string): ASTFinding[] {
  const findings: ASTFinding[] = []
  const codeBlocks = extractAddedCode(hunkContent)

  // Skip hunks with too many blocks
  if (codeBlocks.length > 50) return findings

  // Batch all code blocks into ONE parse call
  const combinedCode = codeBlocks
    .filter(b => b.code.length > 15)
    .map(b => b.code)
    .join('\n')

  if (!combinedCode || combinedCode.length < 10) return findings

  // Limit total code to 5000 chars
  const code = combinedCode.length > 5000 ? combinedCode.slice(0, 5000) : combinedCode

  const swcInstance = getSwc()
  if (!swcInstance) return findings
  try {
    const result = swcInstance.parseSync(code, {
      syntax: 'typescript',
      tsx: true,
      decorators: true,
    } as swc.ParseOptions)
    for (const stmt of (result.body as unknown) as Record<string, unknown>[]) {
      walkAST(stmt, findings)
    }
  } catch {
    // Fallback: try without TS syntax
    try {
      const result = swcInstance.parseSync(code, {
        syntax: 'ecmascript',
        jsx: true,
      } as swc.ParseOptions)
      for (const stmt of (result.body as unknown) as Record<string, unknown>[]) {
        walkAST(stmt, findings)
      }
    } catch { /* skip unparseable content */ }
  }

  return findings
}

// ─── AST Serialization (NIT format for LLM context) ─────────────

interface SerializedNode {
  idx: number
  type: string
  text: string
  children: SerializedNode[]
}

function createSerializer() {
  let nodeCounter = 0

  function serializeNode(node: Record<string, unknown>): SerializedNode {
    const idx = ++nodeCounter
    const children: SerializedNode[] = []

    for (const key of Object.keys(node)) {
      if (key === 'span' || key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in (item as object)) {
            children.push(serializeNode(item as Record<string, unknown>))
          }
        }
      } else if (child && typeof child === 'object' && 'type' in (child as object)) {
        children.push(serializeNode(child as Record<string, unknown>))
      }
    }

    return { idx, type: node.type as string, text: '', children }
  }

  function formatNIT(node: SerializedNode, depth: number = 0): string {
    const indent = '  '.repeat(depth)
    const childRefs = node.children.length > 0 ? ` [${node.children.map(c => `N${c.idx}`).join(',')}]` : ''
    const text = node.text ? ` "${node.text.replace(/["]/g, '\\"').substring(0, 40)}"` : ''
    let result = `${indent}N${node.idx}:${node.type}${text}${childRefs}`
    for (const child of node.children) result += '\n' + formatNIT(child, depth + 1)
    return result
  }

  return { serializeNode, formatNIT }
}

function codeToNIT(codeBlock: string): string {
  if (!codeBlock || codeBlock.trim().length < 10) return ''
  const swcInstance = getSwc()
  if (!swcInstance) return codeBlock.slice(0, 500)
  try {
    const { serializeNode, formatNIT } = createSerializer()
    const result = swcInstance.parseSync(codeBlock, { syntax: 'typescript', tsx: true } as swc.ParseOptions)
    const serializedRoot = serializeNode((result as unknown) as Record<string, unknown>)
    return formatNIT(serializedRoot)
  } catch { return '' }
}

/**
 * Serialize diff content to NIT format AST for LLM context.
 */
export function serializeDiffToAST(diffContent: string): string {
  const blocks = extractAddedCode(diffContent)
  const serialized: string[] = []
  for (const block of blocks) {
    const nit = codeToNIT(block.code)
    if (nit) serialized.push(nit)
  }
  return serialized.join('\n---\n')
}

// ─── Main Entry Point ───────────────────────────────────────────

/**
 * Run SWC AST analysis on JS/TS test files.
 */
export function detectWithAST(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

  const MAX_PARSE_CALLS = 5
  let parseCount = 0

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    if (!TEST_FILE_PATTERN.test(filePath)) continue // Skip non-test files

    for (const hunk of file.hunks) {
      if (parseCount >= MAX_PARSE_CALLS) return findings

      const addedLines = hunk.content.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length
      if (addedLines < 5) continue

      const astFindings = analyzeHunk(hunk.content)
      parseCount++

      for (const af of astFindings) {
        let patternType: string
        switch (af.type) {
          case 'trivial_function':
          case 'conditional_wrap':
          case 'empty_test_shell':
            patternType = 'disabled_assertion'
            break
          case 'async_gutted':
            patternType = 'silent_catch_and_pass'
            break
          case 'stripped_assertions':
            patternType = 'assertion_tampering'
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
          explanation: `🔬 [AST] ${af.explanation}`,
          evidenceExcerpt: af.details.substring(0, 200),
        })
      }
    }
  }

  return findings
}
