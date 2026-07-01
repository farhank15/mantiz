/**
 * Mantiz DiffViewer — GitHub-style diff rendering component
 *
 * Renders diff content with:
 * - Green background for added lines (+)
 * - Red background for removed lines (-)
 * - Blue/purple for hunk headers (@@)
 * - Line numbers in gutter
 * - +/- gutter markers
 * - Copy-to-clipboard button
 * - Dark mode compatible
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { FileCode, Copy, Check } from "lucide-react";

interface DiffViewerProps {
  content: string;
  maxHeight?: string;
  showHeader?: boolean;
  filename?: string;
}

interface DiffLine {
  type: "add" | "remove" | "header" | "context" | "info";
  text: string;
  lineNumber: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function parseDiffLines(content: string): DiffLine[] {
  const lines = content.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");

    if (line.startsWith("@@")) {
      // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10) - 1;
        newLine = parseInt(match[2], 10) - 1;
      }
      result.push({ type: "header", text: line, lineNumber: result.length + 1 });
      continue;
    }

    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff --git") || line.startsWith("index ")) {
      result.push({ type: "info", text: line, lineNumber: result.length + 1 });
      continue;
    }

    if (line.startsWith("+")) {
      newLine++;
      result.push({
        type: "add",
        text: line,
        lineNumber: result.length + 1,
        oldLineNumber: undefined,
        newLineNumber: newLine,
      });
      continue;
    }

    if (line.startsWith("-")) {
      oldLine++;
      result.push({
        type: "remove",
        text: line,
        lineNumber: result.length + 1,
        oldLineNumber: oldLine,
        newLineNumber: undefined,
      });
      continue;
    }

    if (line.startsWith("File:") || line.startsWith("Line:") || line.startsWith("Issue:") || line.startsWith("Pattern:")) {
      result.push({ type: "info", text: line, lineNumber: result.length + 1 });
      continue;
    }

    // Context line (starts with space) or plain text
    oldLine++;
    newLine++;
    result.push({
      type: "context",
      text: line,
      lineNumber: result.length + 1,
      oldLineNumber: oldLine,
      newLineNumber: newLine,
    });
  }

  return result;
}

function getLineColor(line: DiffLine): string {
  switch (line.type) {
    case "add":
      return "bg-success/8 text-success border-l-2 border-success";
    case "remove":
      return "bg-severity-critical/8 text-severity-critical border-l-2 border-severity-critical";
    case "header":
      return "bg-interactive/10 text-interactive border-l-2 border-interactive font-semibold";
    case "info":
      return "text-ink font-semibold bg-surface-2/50";
    case "context":
      return "text-ink-muted";
  }
}

function getLineBg(line: DiffLine): string {
  switch (line.type) {
    case "add":
      return "bg-success/5";
    case "remove":
      return "bg-severity-critical/5";
    case "header":
      return "bg-interactive/5";
    default:
      return "";
  }
}

function getGutterMarker(line: DiffLine): string {
  switch (line.type) {
    case "add":
      return "+";
    case "remove":
      return "−";
    default:
      return "";
  }
}

export default function DiffViewer({
  content,
  maxHeight = "300px",
  showHeader = true,
  filename,
}: DiffViewerProps) {
  const [copied, setCopied] = useState(false);
  const parsed = parseDiffLines(content);
  const hasDiffLines = parsed.some((l) => l.type === "add" || l.type === "remove");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // If no diff lines detected, render as plain code block
  if (!hasDiffLines) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
        {showHeader && (
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <FileCode className="h-3 w-3 text-ink-subdued" />
              <span className="text-[10px] font-medium text-ink-subdued">
                {filename || "evidence.txt"}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="rounded p-1 text-ink-muted transition hover:bg-surface-3 hover:text-ink"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-5 text-ink-muted whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden rounded-lg border border-border bg-surface-2"
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <FileCode className="h-3 w-3 text-ink-subdued" />
            <span className="text-[10px] font-medium text-ink-subdued">
              {filename || (hasDiffLines ? "diff" : "evidence.txt")}
            </span>
            <span className="text-[9px] text-ink-subdued opacity-50 ml-1">
              {parsed.filter((l) => l.type === "add").length} additions &{" "}
              {parsed.filter((l) => l.type === "remove").length} deletions
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="rounded p-1 text-ink-muted transition hover:bg-surface-3 hover:text-ink"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      )}

      {/* Diff lines */}
      <div
        className="overflow-y-auto font-mono text-[11px] leading-5"
        style={{ maxHeight }}
      >
        {parsed.map((line, i) => {
          return (
            <div
              key={i}
              className={`flex ${getLineBg(line)} transition-colors`}
            >
              {/* Gutter — Old line number */}
              <div
                className={`flex w-10 shrink-0 select-none items-center justify-end pr-1 text-[10px] leading-5 tabular-nums ${
                  line.type === "add"
                    ? "text-success/40"
                    : line.type === "remove"
                      ? "text-severity-critical/40"
                      : line.type === "header"
                        ? "text-interactive/40"
                        : "text-ink-subdued/30"
                } ${line.type === "header" ? "bg-interactive/5" : ""}`}
              >
                {line.oldLineNumber !== undefined ? line.oldLineNumber : ""}
              </div>

              {/* Gutter — New line number */}
              <div
                className={`flex w-10 shrink-0 select-none items-center justify-end pr-1 text-[10px] leading-5 tabular-nums ${
                  line.type === "remove"
                    ? "text-severity-critical/40"
                    : line.type === "add"
                      ? "text-success/40"
                      : line.type === "header"
                        ? "text-interactive/40"
                        : "text-ink-subdued/30"
                }`}
              >
                {line.newLineNumber !== undefined ? line.newLineNumber : ""}
              </div>

              {/* Gutter marker (+/-) */}
              <div
                className={`flex w-5 shrink-0 select-none items-center justify-center text-xs font-bold leading-5 ${
                  line.type === "add"
                    ? "text-success"
                    : line.type === "remove"
                      ? "text-severity-critical"
                      : line.type === "header"
                        ? "text-interactive"
                        : "text-transparent"
                }`}
              >
                {getGutterMarker(line)}
              </div>

              {/* Content */}
              <div
                className={`flex-1 overflow-hidden text-ellipsis whitespace-pre-wrap px-1 leading-5 ${getLineColor(line)}`}
              >
                {line.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      {showHeader && parsed.filter((l) => l.type === "add" || l.type === "remove").length > 0 && (
        <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-3 py-1.5 text-[10px] text-ink-subdued">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-success/60" />
            {parsed.filter((l) => l.type === "add").length} additions
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-severity-critical/60" />
            {parsed.filter((l) => l.type === "remove").length} deletions
          </span>
          <span className="ml-auto opacity-50">
            {parsed.length} lines
          </span>
        </div>
      )}
    </motion.div>
  );
}
