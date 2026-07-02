/**
 * Mantiz AST Analyzer
 *
 * Uses @babel/parser to parse TypeScript/JavaScript code into an AST
 * and detect cheating patterns that regex-based detectors can't catch.
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

import * as parser from '@babel/parser'
import type { Finding, ParsedDiff } from './types'

// ─── AST Node Types ──────────────────────────────────────────────

interface ASTNode {
  type: string
  loc: { start: { line: number; column: number }; end: { line: number; column: number } } | null
  [key: string]: unknown
}

interface FunctionBody extends ASTNode {
  body: ASTNode[]
}

interface ReturnStatement extends ASTNode {
  argument: ASTNode | null
}

interface TryStatement extends ASTNode {
  handler: ASTNode | null
  finalizer: ASTNode | null
}

interface CatchClause extends ASTNode {
  body: ASTNode[]
}

interface ASTFinding {
  type: 'trivial_function' | 'async_gutted' | 'conditional_wrap' | 'empty_test_shell' | 'stripped_assertions'
  lineStart: number
  lineEnd: number
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  details: string
}

// ─── AST Walking & Analysis ─────────────────────────────────────

function walkAST(node: ASTNode, findings: ASTFinding[]): void {
  if (!node || typeof node !== 'object') return

  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ObjectMethod':
      analyzeFunction(node, findings)
      break
    case 'TryStatement':
      analyzeTryStatement(node as unknown as TryStatement, findings)
      break
    case 'IfStatement':
      analyzeIfStatement(node, findings)
      break
    case 'SwitchStatement':
      analyzeSwitchStatement(node, findings)
      break
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    const child = (node as Record<string, unknown>)[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in (item as object)) {
          walkAST(item as ASTNode, findings)
        }
      }
    } else if (child && typeof child === 'object' && 'type' in (child as object)) {
      walkAST(child as ASTNode, findings)
    }
  }
}

function analyzeFunction(node: ASTNode, findings: ASTFinding[]): void {
  const body = (node as Record<string, unknown>).body as ASTNode | undefined
  if (!body) return

  let functionBody: ASTNode[]
  if (body.type === 'BlockStatement') {
    functionBody = (body as unknown as FunctionBody).body || []
  } else {
    functionBody = [body]
  }

  const loc = node.loc

  if (functionBody.length === 1 && functionBody[0].type === 'ReturnStatement') {
    const ret = functionBody[0] as ReturnStatement
    if (ret.argument && ['BooleanLiteral', 'NullLiteral', 'Identifier'].includes(ret.argument.type)) {
      const value = ret.argument.type === 'BooleanLiteral'
        ? String((ret.argument as Record<string, unknown>).value)
        : ret.argument.type === 'NullLiteral' ? 'null' : 'identifier'

      if (ret.argument.type === 'Identifier') {
        const name = (ret.argument as Record<string, unknown>).name as string
        if (name !== 'undefined' && name !== 'void') return
      }

      findings.push({
        type: 'trivial_function',
        lineStart: loc?.start.line || 0,
        lineEnd: loc?.end.line || 0,
        confidence: 'high',
        explanation: `Function body replaced with trivial return (${value}) — indicates test logic was gutted.`,
        details: `Function at line ${loc?.start.line} returns ${value} unconditionally.`,
      })
    }
  }

  if (functionBody.length === 1 && functionBody[0].type === 'TryStatement') {
    const tryStmt = functionBody[0] as TryStatement
    if (tryStmt.handler) {
      const catchBody = ((tryStmt.handler as unknown as ASTNode).body || []) as ASTNode[]
      const hasTrivialCatch = catchBody.length <= 1 &&
        (catchBody.length === 0 ||
          (catchBody[0].type === 'ExpressionStatement') ||
          (catchBody[0].type === 'ReturnStatement' &&
            (catchBody[0] as ReturnStatement).argument?.type === 'Identifier' &&
            ((catchBody[0] as ReturnStatement).argument as Record<string, unknown>).name === 'undefined'))

      if (hasTrivialCatch) {
        findings.push({
          type: 'async_gutted',
          lineStart: loc?.start.line || 0,
          lineEnd: loc?.end.line || 0,
          confidence: 'high',
          explanation: 'Function body consists solely of a try/catch with empty/silent catch — all errors are swallowed.',
          details: `Function at line ${loc?.start.line} wraps logic in try/catch with no error handling.`,
        })
      }
    }
  }

  if (functionBody.length === 0 || (functionBody.length === 1 && functionBody[0].type === 'ExpressionStatement' &&
    ((functionBody[0] as Record<string, unknown>).expression as ASTNode)?.type === 'Identifier')) {
    findings.push({
      type: 'empty_test_shell',
      lineStart: loc?.start.line || 0,
      lineEnd: loc?.end.line || 0,
      confidence: 'medium',
      explanation: 'Function body is empty or contains no meaningful logic — likely a placeholder.',
      details: `Function at line ${loc?.start.line} has no meaningful body.`,
    })
  }
}

function analyzeTryStatement(node: TryStatement, findings: ASTFinding[]): void {
  if (!node.handler) return
  const catchBody = ((node.handler as unknown as CatchClause).body || []) as ASTNode[]
  const isEmptyCatch = catchBody.length === 0
  const isCommentOnly = catchBody.length === 1 && catchBody[0].type === 'ExpressionStatement'

  if (isEmptyCatch || isCommentOnly) {
    findings.push({
      type: 'async_gutted',
      lineStart: node.loc?.start.line || 0,
      lineEnd: node.loc?.end.line || 0,
      confidence: 'high',
      explanation: isEmptyCatch
        ? 'Empty catch block detected via AST — no error handling logic at all.'
        : 'Catch block contains only expressions (likely comments) — errors are silently swallowed.',
      details: `Try/catch at line ${node.loc?.start.line} has ${isEmptyCatch ? 'empty' : 'non-functional'} catch body.`,
    })
  }
}

function analyzeIfStatement(node: ASTNode, findings: ASTFinding[]): void {
  const test = (node as Record<string, unknown>).test as ASTNode | undefined
  const loc = node.loc
  if (!test || !loc) return

  if (test.type === 'BooleanLiteral' && (test as Record<string, unknown>).value === false) {
    findings.push({
      type: 'conditional_wrap',
      lineStart: loc.start.line,
      lineEnd: loc.end.line,
      confidence: 'high',
      explanation: 'Code wrapped in if(false) block — will never execute. Tests inside this block are permanently disabled.',
      details: `if(false) block at line ${loc.start.line}`,
    })
  }

  if (test.type === 'NumericLiteral' && (test as Record<string, unknown>).value === 0) {
    findings.push({
      type: 'conditional_wrap',
      lineStart: loc.start.line,
      lineEnd: loc.end.line,
      confidence: 'high',
      explanation: 'Code wrapped in if(0) block — will never execute. This is a known AI agent evasion pattern.',
      details: `if(0) block at line ${loc.start.line}`,
    })
  }

  if (test.type === 'CallExpression' || test.type === 'UnaryExpression' || test.type === 'MemberExpression') {
    const testStr = codeFromNode(test).substring(0, 80)
    if (/skip|SKIP|disable|DISABLE|bypass|BYPASS|mock/.test(testStr)) {
      findings.push({
        type: 'conditional_wrap',
        lineStart: loc.start.line,
        lineEnd: loc.end.line,
        confidence: 'medium',
        explanation: `Code conditionally wrapped — condition references "skip/disable/bypass" semantics at AST level.`,
        details: `Conditional at line ${loc.start.line}: ${testStr}`,
      })
    }
  }
}

function analyzeSwitchStatement(node: ASTNode, findings: ASTFinding[]): void {
  const loc = node.loc
  if (!loc) return
  const discriminant = (node as Record<string, unknown>).discriminant as ASTNode | undefined
  if (!discriminant) return
  const cases = (node as Record<string, unknown>).cases as ASTNode[] | undefined
  if (!cases || cases.length === 0) return

  const defaultCase = cases.find((c: ASTNode) => (c as Record<string, unknown>).test === null)
  if (defaultCase) {
    const consequent = ((defaultCase as Record<string, unknown>).consequent || []) as ASTNode[]
    if (consequent.length <= 1) {
      findings.push({
        type: 'conditional_wrap',
        lineStart: loc.start.line,
        lineEnd: loc.end.line,
        confidence: 'medium',
        explanation: 'Switch statement with trivial default case — may be used to bypass test execution.',
        details: `Switch at line ${loc.start.line}`,
      })
    }
  }
}

function codeFromNode(node: ASTNode): string {
  if (!node) return ''
  switch (node.type) {
    case 'Identifier': return (node as Record<string, unknown>).name as string || ''
    case 'MemberExpression': {
      const obj = codeFromNode(((node as Record<string, unknown>).object) as ASTNode)
      const prop = codeFromNode(((node as Record<string, unknown>).property) as ASTNode)
      return `${obj}.${prop}`
    }
    case 'CallExpression': {
      const callee = codeFromNode(((node as Record<string, unknown>).callee) as ASTNode)
      const args = ((node as Record<string, unknown>).arguments as ASTNode[] || []).map(a => codeFromNode(a)).join(', ')
      return `${callee}(${args})`
    }
    case 'UnaryExpression': {
      const op = (node as Record<string, unknown>).operator as string
      const arg = codeFromNode(((node as Record<string, unknown>).argument) as ASTNode)
      return `${op} ${arg}`
    }
    case 'StringLiteral': return `'${(node as Record<string, unknown>).value as string}'`
    case 'BooleanLiteral': return String((node as Record<string, unknown>).value)
    case 'NumericLiteral': return String((node as Record<string, unknown>).value)
    default: return `[${node.type}]`
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

  for (const block of codeBlocks) {
    try {
      try {
        const result = parser.parse(block.code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
        })
        for (const stmt of result.program.body) walkAST(stmt as unknown as ASTNode, findings)
      } catch {
        try {
          const result = parser.parse(block.code, { sourceType: 'script', plugins: ['jsx'] })
          for (const stmt of result.program.body) walkAST(stmt as unknown as ASTNode, findings)
        } catch { /* skip unparseable blocks */ }
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

  function serializeNode(node: ASTNode): SerializedNode {
    const idx = ++nodeCounter
    const children: SerializedNode[] = []

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
      const child = (node as Record<string, unknown>)[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && 'type' in (item as object)) children.push(serializeNode(item as ASTNode))
        }
      } else if (child && typeof child === 'object' && 'type' in (child as object)) {
        children.push(serializeNode(child as ASTNode))
      }
    }

    return { idx, type: node.type, text: '', children }
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
  try {
    const { serializeNode, formatNIT } = createSerializer()
    const result = parser.parse(codeBlock, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    const serializedRoot = serializeNode(result.program as unknown as ASTNode)
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
 * Run Babel AST analysis on JS/TS files.
 */
export function detectWithAST(files: ParsedDiff[]): Finding[] {
  const findings: Finding[] = []
  const TEST_FILE_PATTERN = /(\.(test|spec)\.(ts|tsx|js|jsx)$)|(\/(?:__tests__|tests?|fixtures)\/)/i

  for (const file of files) {
    const filePath = file.newFile || file.oldFile || 'unknown'
    if (file.newFile === '/dev/null') continue
    const isTestFile = TEST_FILE_PATTERN.test(filePath)

    for (const hunk of file.hunks) {
      const astFindings = analyzeHunk(hunk.content)

      for (const af of astFindings) {
        if (!isTestFile && (af.type === 'empty_test_shell' || af.type === 'stripped_assertions')) continue

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
