import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { Finding } from "../detectors/types";

declare const __APP_VERSION__: string;

interface ScanAnimationProps {
  isScanning: boolean;
  lineCount?: number;
  onComplete: () => void;
  findings?: Finding[];
  trustScore?: number;
  scanPhase: 'idle' | 'static' | 'ai' | 'done';
}

export default function ScanAnimation({
  isScanning,
  onComplete,
  findings = [],
  trustScore,
  scanPhase,
}: ScanAnimationProps) {
  const doneCalled = useRef(false);

  // Call onComplete immediately when scan is done (no fake delay)
  useEffect(() => {
    if (scanPhase === 'done' && !doneCalled.current) {
      doneCalled.current = true;
      onComplete();
    }
  }, [scanPhase, onComplete]);

  // Reset flag when scanning starts
  useEffect(() => {
    if (!isScanning) {
      doneCalled.current = false;
    }
  }, [isScanning]);

  if (!isScanning) return null;

  const totalFindings = findings.length;
  const highCount = findings.filter((f) => f.confidence === "high").length;
  const isClean = totalFindings === 0;

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      {/* ─── STATUS HEADER ──────────────────────────────────── */}
      <div className="border-b border-border bg-surface-2 px-5 py-3 flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center">
          {scanPhase === 'done' ? (
            isClean ? (
              <div className="h-2.5 w-2.5 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
            ) : (
              <div className="h-2.5 w-2.5 rounded-full bg-severity-critical shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
            )
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-interactive" />
          )}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">
            {scanPhase === 'static' && "Static Analysis"}
            {scanPhase === 'ai' && "AI Analysis"}
            {scanPhase === 'done' && (isClean ? "All Clear" : "Cheating Detected")}
          </div>
          <div className="text-xs text-ink-subdued">
            {scanPhase === 'static' && "Running 6 static detectors..."}
            {scanPhase === 'ai' && "Querying AI model..."}
            {scanPhase === 'done' && `${totalFindings} finding${totalFindings !== 1 ? "s" : ""} · ${highCount} high severity`}
          </div>
        </div>
      </div>

      {/* ─── RESULTS SUMMARY ────────────────────────────────── */}
      <div className="px-5 py-4">
        {scanPhase === 'done' ? (
          <div className="space-y-3">
            {/* Score */}
            <div className="text-center">
              <div className={`text-3xl font-bold ${
                trustScore !== undefined && trustScore >= 80
                  ? "text-success"
                  : trustScore !== undefined && trustScore >= 50
                    ? "text-severity-medium"
                    : "text-severity-critical"
              }`}>
                {(trustScore ?? 0)}/100
              </div>
              <div className="text-xs text-ink-muted">Trust Score</div>
            </div>

            {/* Stats row */}
            <div className="flex justify-center gap-4 text-xs">
              <span className="text-severity-critical">{highCount} high</span>
              <span className="text-severity-medium">
                {findings.filter(f => f.confidence === "medium").length} med
              </span>
              <span className="text-ink-muted">
                {findings.filter(f => f.confidence === "low").length} low
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-ink-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            {scanPhase === 'static' ? "Analyzing code patterns..." : "Running semantic analysis..."}
          </div>
        )}
      </div>

      {/* ─── FOOTER ─────────────────────────────────────────── */}
      <div className="border-t border-border bg-surface-2 px-5 py-2">
        <div className="flex items-center justify-between text-[10px] text-ink-subdued">
          <span>
            {scanPhase === 'static' && "Mode: Static Analysis"}
            {scanPhase === 'ai' && "Mode: AI Analysis"}
            {scanPhase === 'done' && "Scan complete"}
          </span>
          <span>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}
