import { parsePatch } from 'diff'
import type { StructuredPatch } from 'diff'
import type { ParsedDiff, DiffHunk } from './types'

/**
 * Attempt to manually extract diff info when parsePatch fails.
 * Falls back to a simple line-by-line analysis.
 */
function fallbackParse(raw: string): ParsedDiff[] {
  const lines = raw.split('\n')
  const result: ParsedDiff[] = []

  let currentFile: string | null = null
  let currentHunks: DiffHunk[] = []
  let hunkLines: string[] = []
  let hunkNewStart = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // File header → save previous file, start new one
    if (line.startsWith('diff --git ')) {
      // Push last hunk
      if (hunkLines.length > 0) {
        currentHunks.push({
          oldStart: 1,
          oldLines: hunkLines.length,
          newStart: hunkNewStart,
          newLines: hunkLines.length,
          content: hunkLines.join('\n'),
        })
        hunkLines = []
      }
      // Save previous file
      if (currentFile && currentHunks.length > 0) {
        result.push({ newFile: currentFile, hunks: currentHunks })
      }
      const match = line.match(/diff --git a\/[^ ]+ b\/(.+)/)
      currentFile = match ? match[1] : 'unknown'
      currentHunks = []
      hunkNewStart = 1
      continue
    }

    // Hunk header → save previous hunk, start new one
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
    if (hunkMatch) {
      if (hunkLines.length > 0) {
        currentHunks.push({
          oldStart: 1,
          oldLines: hunkLines.length,
          newStart: hunkNewStart,
          newLines: hunkLines.length,
          content: hunkLines.join('\n'),
        })
        hunkLines = []
      }
      hunkNewStart = parseInt(hunkMatch[3], 10)
      continue
    }

    // Skip metadata lines
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('index ')) {
      continue
    }

    // Collect diff lines (those starting with +, -, or space)
    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      hunkLines.push(line)
    }
  }

  // Save last hunk + file
  if (hunkLines.length > 0) {
    currentHunks.push({
      oldStart: 1,
      oldLines: hunkLines.length,
      newStart: hunkNewStart,
      newLines: hunkLines.length,
      content: hunkLines.join('\n'),
    })
  }
  if (currentFile && currentHunks.length > 0) {
    result.push({ newFile: currentFile, hunks: currentHunks })
  }

  // Edge case: no file headers found but has diff-like content
  if (result.length === 0 && hunkLines.length > 0) {
    result.push({
      newFile: 'unknown',
      hunks: [{
        oldStart: 1,
        oldLines: hunkLines.length,
        newStart: 1,
        newLines: hunkLines.length,
        content: hunkLines.join('\n'),
      }],
    })
  }

  return result
}

/**
 * Parse a raw git diff string into structured, file-scoped hunks.
 * Gracefully handles malformed diffs by falling back to a simpler parser.
 */
export function parseRawDiff(raw: string): ParsedDiff[] {
  if (!raw || !raw.trim()) {
    return []
  }

  try {
    const parsed: StructuredPatch[] = parsePatch(raw)

    return parsed.map((file) => {
      const hunks: DiffHunk[] = (file.hunks ?? []).map((hunk) => ({
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        content: (hunk.lines ?? []).join('\n'),
      }))

      return {
        oldFile: file.oldFileName ?? undefined,
        newFile: file.newFileName ?? undefined,
        hunks,
      }
    })
  } catch {
    // parsePatch can throw on malformed diffs (e.g., mismatched hunk line counts)
    // Fall back to a lenient manual parser
    return fallbackParse(raw)
  }
}
