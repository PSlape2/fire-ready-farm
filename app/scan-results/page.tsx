"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types matching /report/summary response
// ---------------------------------------------------------------------------

interface SummaryHazard {
  name: string;
  location_in_image: string;
  urgency: "MUST" | "SHOULD" | "COULD" | "MAY";
  action: string;
}

interface ScanSummary {
  frames_analyzed: number;
  highest_risk: string | null;
  average_ffwi: number;
  hazards: SummaryHazard[];
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const URGENCY_ORDER = { MUST: 0, SHOULD: 1, COULD: 2, MAY: 3 } as const;

const URGENCY_STYLE: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  MUST:   { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA", badge: "#DC2626" },
  SHOULD: { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A", badge: "#D97706" },
  COULD:  { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE", badge: "#2563EB" },
  MAY:    { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0", badge: "#16A34A" },
};

const RISK_STYLE: Record<string, { color: string; bg: string; gradFrom: string; gradTo: string; label: string }> = {
  Extreme: { color: "#9B1C1C", bg: "#FEF2F2", gradFrom: "#7F1D1D", gradTo: "#B91C1C", label: "Extreme Risk" },
  High:    { color: "#DC2626", bg: "#FEF2F2", gradFrom: "#991B1B", gradTo: "#DC2626", label: "High Risk" },
  Moderate:{ color: "#D97706", bg: "#FFFBEB", gradFrom: "#78350F", gradTo: "#D97706", label: "Moderate Risk" },
  Low:     { color: "#16A34A", bg: "#F0FDF4", gradFrom: "#14532D", gradTo: "#16A34A", label: "Low Risk" },
};

function getRisk(level: string | null) {
  return RISK_STYLE[level ?? "Low"] ?? RISK_STYLE.Low;
}

// ---------------------------------------------------------------------------
// Hazard card
// ---------------------------------------------------------------------------

function HazardCard({ hazard, index }: { hazard: SummaryHazard; index: number }) {
  const [checked, setChecked] = useState(false);
  const s = URGENCY_STYLE[hazard.urgency] ?? URGENCY_STYLE.MAY;
  return (
    <button
      onClick={() => setChecked((v) => !v)}
      className="w-full text-left p-4 rounded-2xl transition-all"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        opacity: checked ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-3">
        {/* Checkbox circle */}
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
          style={{ background: checked ? "#16A34A" : s.badge }}>
          {checked ? "✓" : index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
              style={{ background: s.badge }}>
              {hazard.urgency}
            </span>
            <span
              className="text-sm font-semibold"
              style={{
                color: "var(--smoke)",
                textDecoration: checked ? "line-through" : "none",
              }}>
              {hazard.name}
            </span>
          </div>
          <p className="text-xs mb-1" style={{ color: "#A8A29E" }}>
            📍 {hazard.location_in_image}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "#78716C" }}>
            {hazard.action}
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ScanResultsPage() {
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("wildfireScanSummary");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ScanSummary;
        // Ensure hazards are sorted by urgency
        parsed.hazards = [...(parsed.hazards ?? [])].sort(
          (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
        );
        setSummary(parsed);
      } catch {
        // ignore malformed data
      }
    }
    setLoaded(true);
  }, []);

  const handleNewScan = () => {
    localStorage.removeItem("wildfireScanSummary");
    window.open("/test.html", "_blank");
  };

  const risk = getRisk(summary?.highest_risk ?? null);

  // Group hazard counts
  const mustCount   = summary?.hazards.filter((h) => h.urgency === "MUST").length   ?? 0;
  const shouldCount = summary?.hazards.filter((h) => h.urgency === "SHOULD").length ?? 0;

  return (
    <main className="min-h-screen" style={{ background: "var(--parchment)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-stone-200 bg-white">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl flicker">🔥</span>
          <span className="font-display text-xl font-semibold" style={{ color: "var(--smoke)" }}>
            FireReady<span style={{ color: "var(--ember)" }}>Farm</span>
          </span>
        </Link>
        <Link
          href="/assess"
          className="text-sm font-medium px-4 py-2 rounded-full hover:bg-stone-100 transition-colors"
          style={{ color: "var(--clay)" }}>
          ← Back to Assessment
        </Link>
      </nav>

      {!loaded ? (
        // Loading state
        <div className="flex items-center justify-center h-64">
          <span className="text-4xl spin-slow">🔥</span>
        </div>
      ) : !summary ? (
        // No data state
        <div className="max-w-xl mx-auto px-6 py-20 text-center">
          <span className="text-5xl block mb-5">📭</span>
          <h1 className="font-display text-3xl font-bold mb-3" style={{ color: "var(--smoke)" }}>
            No Scan Data Found
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--clay)" }}>
            There&apos;s no session summary yet. Run a live scan first, then exit to see your results.
          </p>
          <button
            onClick={handleNewScan}
            className="px-7 py-3 rounded-full text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--ember)" }}>
            Start a Live Scan →
          </button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-10">

          {/* Hero banner */}
          <div className="rounded-3xl overflow-hidden mb-8"
            style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.14)" }}>
            <div
              className="px-8 pt-10 pb-8 text-center"
              style={{ background: `linear-gradient(135deg, ${risk.gradFrom} 0%, ${risk.gradTo} 100%)` }}>
              <span className="block text-xs font-semibold tracking-widest uppercase mb-4"
                style={{ color: "rgba(255,255,255,0.55)" }}>
                Live Scan Summary
              </span>
              <div
                className="inline-block px-6 py-2 rounded-full font-bold text-white text-xl mb-5"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}>
                {risk.label}
              </div>
              <p className="text-sm max-w-xs mx-auto" style={{ color: "rgba(255,255,255,0.72)" }}>
                {mustCount > 0
                  ? `${mustCount} critical hazard${mustCount > 1 ? "s" : ""} require${mustCount === 1 ? "s" : ""} immediate removal.`
                  : shouldCount > 0
                  ? `${shouldCount} hazard${shouldCount > 1 ? "s" : ""} should be addressed soon.`
                  : "No critical hazards detected during this session."}
              </p>
            </div>

            {/* Stats bar */}
            <div
              className="flex divide-x"
              style={{
                background: "#1C1917",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                divideColor: "#292524",
              }}>
              {[
                { label: "Frames Analyzed", value: summary.frames_analyzed },
                { label: "Avg FFWI Score",  value: summary.average_ffwi.toFixed(1) },
                { label: "Hazards Found",   value: summary.hazards.length },
              ].map((stat) => (
                <div key={stat.label} className="flex-1 px-4 py-4 text-center"
                  style={{ borderRight: "1px solid #292524" }}>
                  <div className="text-xs mb-1" style={{ color: "#78716C" }}>{stat.label}</div>
                  <div
                    className="text-xl font-bold"
                    style={{ color: "rgba(255,255,255,0.8)", fontFamily: "Fraunces, serif" }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hazard checklist */}
          {summary.hazards.length > 0 ? (
            <div className="mb-8">
              <h2 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--smoke)" }}>
                Detected Hazards
              </h2>
              <p className="text-sm mb-5" style={{ color: "var(--clay)" }}>
                {summary.hazards.length} unique hazard{summary.hazards.length > 1 ? "s" : ""} across all
                frames · click to mark resolved
              </p>

              {/* Urgency legend */}
              <div className="flex flex-wrap gap-2 mb-5">
                {(["MUST", "SHOULD", "COULD", "MAY"] as const).map((u) => {
                  const count = summary.hazards.filter((h) => h.urgency === u).length;
                  if (count === 0) return null;
                  const s = URGENCY_STYLE[u];
                  return (
                    <span key={u} className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                      {u} · {count}
                    </span>
                  );
                })}
              </div>

              <div className="space-y-3">
                {summary.hazards.map((h, i) => (
                  <HazardCard key={`${h.name}-${i}`} hazard={h} index={i} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-10 text-center mb-8"
              style={{ background: "white", border: "1px solid #E7E5E4" }}>
              <span className="text-4xl block mb-3">✅</span>
              <p className="font-semibold mb-1" style={{ color: "var(--smoke)" }}>
                No hazards detected
              </p>
              <p className="text-sm" style={{ color: "var(--clay)" }}>
                Great news — no wildfire hazards were identified during this scan session.
              </p>
            </div>
          )}

          {/* CTA footer */}
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "linear-gradient(135deg, var(--smoke), var(--ash))" }}>
            <p className="font-display text-xl text-white font-semibold mb-1">Ready for another look?</p>
            <p className="text-sm text-stone-400 mb-5">
              Start a new scan to check a different area or time of day.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleNewScan}
                className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: "var(--ember)", color: "white" }}>
                Start New Scan →
              </button>
              <Link
                href="/assess"
                className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-80"
                style={{ border: "1.5px solid rgba(255,255,255,0.3)", color: "white" }}>
                Full Assessment
              </Link>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}
