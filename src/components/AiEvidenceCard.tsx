/**
 * AiEvidenceCard — readable evidence display for AI-assisted findings
 *
 * Parses the "File: / Line: / Issue:" format from ai-assisted.ts
 * and renders a clean card with icons, monospace paths, and readable text.
 * Falls back to plain content if format doesn't match.
 */

import { FileCode, MapPin, Lightbulb, AlertTriangle } from "lucide-react";

interface ParsedAiEvidence {
  filePath: string;
  lineRange: string;
  issue: string;
}

function parseAiEvidence(content: string): ParsedAiEvidence | null {
  const lines = content.split("\n").map((l) => l.trim());
  let filePath = "";
  let lineRange = "";
  let issue = "";

  for (const line of lines) {
    if (line.startsWith("File:")) {
      filePath = line.slice(5).trim();
    } else if (line.startsWith("Line:")) {
      lineRange = line.slice(5).trim();
    } else if (line.startsWith("Issue:")) {
      issue = line.slice(6).trim();
    }
  }

  if (!filePath && !issue) return null;
  return { filePath, lineRange, issue };
}

interface AiEvidenceCardProps {
  content: string;
}

export default function AiEvidenceCard({ content }: AiEvidenceCardProps) {
  const parsed = parseAiEvidence(content);

  // Fallback — render as plain text if not AI evidence format
  if (!parsed) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap text-ink-muted">
        {content}
      </div>
    );
  }

  const { filePath, lineRange, issue } = parsed;

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-surface-2/50">
      {/* File path row */}
      <div className="flex items-center gap-2 border-b border-border/40 bg-interactive/5 px-3.5 py-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-interactive/10">
          <FileCode className="h-3.5 w-3.5 text-interactive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-ink font-mono truncate">
            {filePath}
          </div>
          {lineRange && (
            <div className="flex items-center gap-1 text-[10px] text-ink-subdued mt-0.5">
              <MapPin className="h-2.5 w-2.5" />
              Line {lineRange}
            </div>
          )}
        </div>
      </div>

      {/* Issue description */}
      {issue && (
        <div className="flex items-start gap-2.5 px-3.5 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-severity-medium/10">
            <Lightbulb className="h-3 w-3 text-severity-medium" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-subdued mb-0.5">
              What was detected
            </div>
            <p className="text-xs leading-relaxed text-ink">
              {issue}
            </p>
          </div>
        </div>
      )}

      {/* Empty state for edge case */}
      {!issue && (
        <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-ink-muted">
          <AlertTriangle className="h-3 w-3" />
          No issue description available
        </div>
      )}
    </div>
  );
}
