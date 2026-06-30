import { parsePatch } from 'diff'
import type { StructuredPatch } from 'diff'
import type { ParsedDiff, DiffHunk } from './types'

/**
 * Parse a raw git diff string into structured, file-scoped hunks.
 */
export function parseRawDiff(raw: string): ParsedDiff[] {
  if (!raw || !raw.trim()) {
    return []
  }

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
}
