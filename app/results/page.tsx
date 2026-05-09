"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import type { WeatherApiResponse } from "../api/weather/route";
import type { ImageFinding, ModelDebugInfo } from "../../lib/scoring";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const PROPERTY_FACTORS = [
  { id: "vegetation", icon: "🌿", label: "Vegetation Type",      weight: 20 },
  { id: "water",      icon: "💧", label: "Water Availability",   weight: 15 },
  { id: "firebreak",  icon: "🛡️", label: "Defensible Space",     weight: 15 },
  { id: "proximity",  icon: "🗺️", label: "Fire History (Area)",  weight: 10 },
  { id: "slope",      icon: "⛰️", label: "Terrain & Slope",      weight: 10 },
];

const CHECKLISTS: Record<string, string[]> = {
  extreme: [
    "Do not burn — any open burning is extremely dangerous right now",
    "Pre-position water pumps and fire tools at all structure access points",
    "Enact your livestock evacuation plan immediately if fire is nearby",
    "Create or expand a 100-ft defensible space around all structures",
    "Clear gutters and roof of debris — embers travel up to 1 mile",
    "Install ember-resistant vents on all barns and outbuildings",
    "Establish a dedicated water storage tank (minimum 5,000 gallons)",
    "Mark your driveway clearly — fire trucks must be able to turn around",
    "Sign up for your county emergency alert system",
    "Have go-bags and evacuation routes planned and communicated to all on-site",
  ],
  high: [
    "Create or expand a 100-ft defensible space around all structures",
    "Clear gutters and roof of debris — embers travel up to 1 mile",
    "Install ember-resistant vents on all barns and outbuildings",
    "Establish a dedicated water storage tank (minimum 5,000 gallons)",
    "Develop and practice a livestock evacuation plan with your family",
    "Cut or mow dry grass to under 4 inches throughout the property",
    "Remove dead or dying trees within 100 ft of structures",
    "Mark your driveway clearly — fire trucks must be able to turn around",
    "Sign up for your county emergency alert system",
  ],
  moderate: [
    "Establish a 30-ft defensible space around all structures",
    "Create a firebreak along the property border facing prevailing winds",
    "Store hay and combustibles at least 50 ft from structures",
    "Ensure driveway is wide enough for emergency vehicles (12 ft min)",
    "Install exterior sprinklers on main structures",
    "Keep a stockpile of fire tools: shovels, rakes, fire extinguishers",
    "Conduct a yearly property fire risk review each spring",
    "Register livestock with your county emergency management office",
  ],
  low: [
    "Conduct an annual property walkthrough for fire hazards",
    "Maintain existing firebreaks and defensible space",
    "Review and update your emergency evacuation plan",
    "Keep emergency water supply stocked",
    "Stay informed with local fire weather alerts",
  ],
};

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computePropertyScore(params: URLSearchParams): number {
  let score = 0;
  const veg = params.get("vegetationType");
  if (veg === "chaparral")              score += 25;
  else if (veg === "grassland")         score += 22;
  else if (veg === "mixed-forest")      score += 16;
  else if (veg === "irrigated-crops")   score += 8;
  else if (veg === "vineyard-orchard")  score += 10;
  else                                  score += 15;

  const water = params.get("waterSource");
  if (water === "none")            score += 20;
  else if (water === "well")       score += 15;
  else if (water === "tank")       score += 8;
  else if (water === "municipal")  score += 6;
  else if (water === "pond-creek") score += 10;
  else                             score += 12;

  const fb = params.get("hasFirebreak");
  if (fb === "no")               score += 20;
  else if (fb === "yes-partial") score += 12;
  else if (fb === "yes-full")    score += 3;
  else                           score += 15;

  const loc = params.get("location") || "";
  score += (loc.length % 10) + 5;

  const acreage = params.get("acreage") || "";
  if (acreage === "200+")       score += 5;
  else if (acreage === "50–200") score += 3;

  return Math.min(100, Math.max(10, score));
}

function getPropertyFactorScore(factorId: string, params: URLSearchParams): number {
  switch (factorId) {
    case "vegetation": {
      const v = params.get("vegetationType");
      if (v === "chaparral" || v === "grassland") return 82;
      if (v === "mixed-forest") return 60;
      return 30;
    }
    case "water": {
      const w = params.get("waterSource");
      if (w === "none") return 90;
      if (w === "well") return 65;
      if (w === "tank") return 50;
      return 25;
    }
    case "firebreak": {
      const f = params.get("hasFirebreak");
      if (f === "no") return 88;
      if (f === "yes-partial") return 55;
      return 15;
    }
    case "proximity": return 55;
    case "slope":     return 42;
    default:          return 50;
  }
}

function getRiskMeta(score: number) {
  if (score >= 75)
    return { label: "Extreme Fire Risk", tier: "extreme" as const, color: "#9B1C1C", bg: "#FEF2F2",
      gradFrom: "#7F1D1D", gradTo: "#B91C1C" };
  if (score >= 55)
    return { label: "High Risk", tier: "high" as const, color: "#DC2626", bg: "#FEF2F2",
      gradFrom: "#991B1B", gradTo: "#DC2626" };
  if (score >= 35)
    return { label: "Moderate Risk", tier: "moderate" as const, color: "#D97706", bg: "#FFFBEB",
      gradFrom: "#78350F", gradTo: "#D97706" };
  return { label: "Low Risk", tier: "low" as const, color: "#16A34A", bg: "#F0FDF4",
    gradFrom: "#14532D", gradTo: "#16A34A" };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreHero({
  score, risk, propertyScore, weatherScore, imageScore,
}: {
  score: number;
  risk: ReturnType<typeof getRiskMeta>;
  propertyScore: number;
  weatherScore: number | null;
  imageScore: number | null;
}) {
  const description =
    risk.tier === "extreme" ? "Critical fire conditions. Immediate action required."
    : risk.tier === "high"  ? "Significant wildfire exposure. Preventive action strongly recommended."
    : risk.tier === "moderate" ? "Moderate risk. Targeted improvements can substantially reduce exposure."
    : "Relatively low risk. Maintain current practices and stay vigilant.";

  const pills = [
    { label: "Property", value: propertyScore },
    ...(weatherScore !== null ? [{ label: "Weather", value: weatherScore }] : []),
    ...(imageScore !== null  ? [{ label: "Image AI", value: imageScore }] : []),
  ];

  return (
    <div className="animate-rise-1 rounded-3xl overflow-hidden mb-8"
      style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
      <div className="px-8 pt-10 pb-8 text-center"
        style={{ background: `linear-gradient(135deg, ${risk.gradFrom} 0%, ${risk.gradTo} 100%)` }}>
        <span className="block text-xs font-semibold tracking-widest uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.55)" }}>
          Wildfire Risk Score
        </span>
        <div className="mb-3" style={{
          fontSize: "clamp(72px, 14vw, 112px)",
          fontWeight: 700,
          color: "white",
          lineHeight: 1,
          fontFamily: "Fraunces, serif",
        }}>
          {score}
        </div>
        <div className="inline-block px-6 py-2 rounded-full font-bold text-white text-lg mb-5"
          style={{ background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.3)" }}>
          {risk.label}
        </div>
        <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: "rgba(255,255,255,0.72)" }}>
          {description}
        </p>
        <div className="w-full max-w-xs mx-auto">
          <div className="w-full h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div className="h-2.5 rounded-full transition-all duration-1000"
              style={{ width: `${score}%`, background: "rgba(255,255,255,0.85)" }} />
          </div>
          <div className="flex justify-between mt-1.5 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span>0 — Low</span><span>100 — Extreme</span>
          </div>
        </div>
      </div>
      {pills.length > 1 && (
        <div className="flex divide-x divide-stone-800"
          style={{ background: "#1C1917", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {pills.map((p) => (
            <div key={p.label} className="flex-1 px-4 py-3 text-center">
              <div className="text-xs mb-0.5" style={{ color: "#78716C" }}>{p.label}</div>
              <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>
                {p.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FactorBar({
  icon, label, score, weight,
}: {
  icon: string; label: string; score: number; weight: number;
}) {
  const meta =
    score >= 65 ? { color: "#DC2626", bg: "#FEF2F2", badge: "High" }
    : score >= 40 ? { color: "#D97706", bg: "#FFFBEB", badge: "Medium" }
    : { color: "#16A34A", bg: "#F0FDF4", badge: "Low" };
  return (
    <div className="p-4 rounded-2xl" style={{ background: "white", border: "1px solid #E7E5E4" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-semibold" style={{ color: "var(--smoke)" }}>{label}</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: meta.bg, color: meta.color }}>{meta.badge}</span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "#F5F5F4" }}>
        <div className="h-2 rounded-full transition-all"
          style={{ width: `${score}%`, background: meta.color }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs" style={{ color: "#A8A29E" }}>Weight: {Math.round(weight)}%</span>
        <span className="text-xs font-medium" style={{ color: meta.color }}>{score}/100</span>
      </div>
    </div>
  );
}

function WindArrow({ degrees }: { degrees: number }) {
  const rad = (degrees * Math.PI) / 180;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20"
      style={{ display: "inline-block", verticalAlign: "middle" }}>
      <circle cx="10" cy="10" r="9" fill="#FEF3ED" stroke="#FCA16C" strokeWidth="1.5" />
      <line x1="10" y1="10" x2={10 + 6 * Math.sin(rad)} y2={10 - 6 * Math.cos(rad)}
        stroke="#E85D26" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WeatherPanel({ data }: { data: WeatherApiResponse }) {
  const { weather, risk } = data;
  const tiles = [
    {
      label: "Temperature", value: `${weather.temperature}°F`,
      sub: weather.temperature >= 100 ? "Extreme heat"
        : weather.temperature >= 85 ? "Very warm" : "Warm",
    },
    {
      label: "Humidity", value: `${weather.relativeHumidity}%`,
      sub: weather.relativeHumidity <= 15 ? "Critical low"
        : weather.relativeHumidity <= 30 ? "Very dry" : "Dry",
    },
    {
      label: "Wind", value: `${weather.windSpeed} mph`,
      sub: (
        <span className="flex items-center gap-1">
          <WindArrow degrees={weather.windDirection} />
          {weather.windDirectionLabel}
        </span>
      ),
    },
    {
      label: "Precipitation",
      value: weather.precipitation === 0 ? "None" : `${weather.precipitation}"`,
      sub: weather.precipitation === 0 ? "No recent rain" : "Past hour",
    },
  ];
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E7E5E4" }}>
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ background: risk.bg, borderBottom: `1px solid ${risk.color}25` }}>
        <span className="text-sm font-bold" style={{ color: risk.color }}>
          Live Weather Conditions
        </span>
        <span className="text-xs" style={{ color: "#A8A29E" }}>
          {new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ borderBottom: "1px solid #F5F5F4" }}>
        {tiles.map((t) => (
          <div key={t.label} className="px-4 py-4 flex flex-col gap-1"
            style={{ background: "white", borderRight: "1px solid #F5F5F4" }}>
            <span className="text-xs" style={{ color: "#A8A29E" }}>{t.label}</span>
            <span className="text-xl font-bold" style={{
              color: "var(--smoke)", fontFamily: "Fraunces, serif",
            }}>
              {t.value}
            </span>
            <span className="text-xs" style={{ color: "var(--clay)" }}>{t.sub}</span>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 text-sm" style={{ background: "#FAFAF9" }}>
        <span className="font-semibold" style={{ color: risk.color }}>
          Weather risk: {risk.label}
        </span>
        <span style={{ color: "var(--clay)" }}> · {risk.summary}</span>
      </div>
    </div>
  );
}

const FINDING_ICONS: Record<string, string> = {
  dry_vegetation:        "🌾",
  dense_brush:           "🌿",
  trees_near_structures: "🌲",
  flammable_objects:     "⚠️",
  poor_defensible_space: "🛡️",
};

function ModelDebugPanel({ debug, modelsUsed, onClose }: {
  debug: ModelDebugInfo;
  modelsUsed: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const fmt = (n: number | null) => n === null ? "—" : n.toFixed(3);
  const bar = (n: number | null) => {
    if (n === null) return null;
    const pct = Math.round(n * 100);
    const color = n >= 0.65 ? "#DC2626" : n >= 0.38 ? "#D97706" : "#16A34A";
    return (
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full" style={{ background: "#21262D" }}>
          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span style={{ color, fontSize: 10, fontFamily: "monospace" }}>{pct}%</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "#0D1117", border: "1px solid #30363D" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #21262D" }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" style={{ color: "#E6EDF3", fontFamily: "monospace" }}>
              Vision Model Output
            </span>
            <span className="text-xs px-2 py-0.5 rounded"
              style={{ background: "#161B22", color: "#8B949E", fontFamily: "monospace" }}>
              {modelsUsed.join(" · ")}
            </span>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded transition-colors hover:bg-white/10"
            style={{ color: "#8B949E", fontFamily: "monospace" }}>
            esc ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5" style={{ fontFamily: "monospace" }}>

          {/* Captions */}
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: "#58A6FF" }}>CAPTIONS</p>
            {debug.blipCaption
              ? <p className="text-xs mb-1"><span style={{ color: "#7D8590" }}>blip-large  </span><span style={{ color: "#A5D6FF" }}>&quot;{debug.blipCaption}&quot;</span></p>
              : <p className="text-xs" style={{ color: "#484F58" }}>blip-large  unavailable</p>}
            {debug.vitCaption
              ? <p className="text-xs"><span style={{ color: "#7D8590" }}>git-large   </span><span style={{ color: "#A5D6FF" }}>&quot;{debug.vitCaption}&quot;</span></p>
              : <p className="text-xs" style={{ color: "#484F58" }}>git-large   unavailable</p>}
          </div>

          {/* Per-hazard scores */}
          <div>
            <p className="text-xs font-bold mb-3" style={{ color: "#58A6FF" }}>PER-HAZARD SCORES</p>
            <div className="space-y-4">
              {debug.hazards.map((h) => (
                <div key={h.id} className="p-3 rounded-lg" style={{ background: "#161B22", border: "1px solid #21262D" }}>
                  <p className="text-xs font-bold mb-2" style={{ color: "#79C0FF" }}>
                    {h.id.toUpperCase()}
                  </p>

                  {/* Binary characteristic checks */}
                  <div className="mb-3 space-y-2">
                    {h.questions.length > 0 ? h.questions.map((q, qi) => {
                      const detected = q.answer === "detected";
                      const unavail  = q.answer === null;
                      return (
                        <div key={qi} className="text-xs">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span style={{
                              color: unavail ? "#484F58" : detected ? "#F85149" : "#3FB950",
                              fontFamily: "monospace", fontWeight: "bold",
                            }}>
                              {unavail ? "[ ]" : detected ? "[✓]" : "[ ]"}
                            </span>
                            <span style={{ color: unavail ? "#484F58" : "#E6EDF3" }}>
                              {q.question}
                            </span>
                            {!unavail && (
                              <span className="ml-auto flex-shrink-0" style={{
                                color: detected ? "#F85149" : "#3FB950",
                                fontFamily: "monospace",
                              }}>
                                {detected ? `+${fmt(q.score)}` : "+0.000"}
                              </span>
                            )}
                          </div>
                          {!unavail && (
                            <div className="flex gap-3 pl-6" style={{ color: "#484F58" }}>
                              <span>pos <span style={{ color: "#79C0FF" }}>{fmt(q.apiScore)}</span></span>
                              <span>neg <span style={{ color: "#7D8590" }}>{fmt((q as {negScore?: number | null}).negScore ?? null)}</span></span>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <p className="text-xs" style={{ color: "#484F58" }}>CLIP unavailable</p>
                    )}
                  </div>

                  {/* Hazard total */}
                  <div className="flex items-center gap-3 text-xs pt-2"
                    style={{ borderTop: "1px solid #21262D" }}>
                    <span style={{ color: "#484F58" }}>hazard score</span>
                    <span style={{ color: "#3FB950", fontFamily: "monospace" }}>{fmt(h.scores.final)}</span>
                    {bar(h.scores.final)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageFindingsPanel({
  findings, score, debug, modelsUsed,
}: {
  findings: ImageFinding[];
  score: number;
  debug?: ModelDebugInfo | null;
  modelsUsed?: string[];
}) {
  const [debugOpen, setDebugOpen] = useState(false);
  const detectedCount = findings.filter((f) => f.detected).length;
  const severityMeta = (severity: ImageFinding["severity"], detected: boolean) => {
    if (!detected) return { bg: "#F0FDF4", border: "#BBF7D0", badgeBg: "#16A34A", badgeText: "Clear" };
    if (severity === "high")     return { bg: "#FEF2F2", border: "#FECACA", badgeBg: "#DC2626", badgeText: "High Risk" };
    if (severity === "moderate") return { bg: "#FFFBEB", border: "#FDE68A", badgeBg: "#D97706", badgeText: "Detected" };
    return { bg: "#F0FDF4", border: "#BBF7D0", badgeBg: "#16A34A", badgeText: "Minor" };
  };

  return (
    <div>
      {debugOpen && debug && (
        <ModelDebugPanel
          debug={debug}
          modelsUsed={modelsUsed ?? []}
          onClose={() => setDebugOpen(false)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-bold" style={{ color: "var(--smoke)" }}>
            AI Image Analysis
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--clay)" }}>
            {detectedCount} of {findings.length} hazards detected · Image risk score:{" "}
            <span className="font-semibold" style={{ color: score >= 55 ? "#DC2626" : "#D97706" }}>
              {score}/100
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {debug && (
            <button
              onClick={() => setDebugOpen(true)}
              className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-stone-200"
              style={{ background: "#F5F5F4", color: "#78716C", fontFamily: "monospace" }}>
              {"</>"}
            </button>
          )}
          <span className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: "#1C1917", color: "#A8A29E" }}>
            Open Source · BLIP Vision
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {findings.map((f) => {
          const m = severityMeta(f.severity, f.detected);
          return (
            <div key={f.id} className="p-4 rounded-2xl transition-all"
              style={{ background: m.bg, border: `1px solid ${m.border}` }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl flex-shrink-0">{FINDING_ICONS[f.id] ?? "•"}</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--smoke)" }}>
                    {f.label}
                  </span>
                </div>
                <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: m.badgeBg }}>
                  {m.badgeText}
                </span>
              </div>
              {f.detected && (
                <p className="text-xs leading-relaxed pl-7" style={{ color: "#78716C" }}>
                  {f.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistSection({ items, riskColor }: { items: string[]; riskColor: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const pct = items.length ? Math.round((checked.size / items.length) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: "var(--clay)" }}>
          {checked.size} / {items.length} completed
        </span>
        <span className="text-sm font-bold" style={{ color: riskColor }}>{pct}%</span>
      </div>
      <div className="w-full h-2 rounded-full mb-5" style={{ background: "#E7E5E4" }}>
        <div className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: riskColor }} />
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E7E5E4" }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => toggle(i)}
            className="w-full flex items-start gap-4 px-5 py-4 text-left transition-all hover:brightness-95"
            style={{
              borderBottom: i < items.length - 1 ? "1px solid #F5F5F4" : "none",
              background: i % 2 === 0 ? "white" : "var(--parchment)",
              opacity: checked.has(i) ? 0.5 : 1,
            }}>
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
              text-white text-xs font-bold mt-0.5 transition-all"
              style={{ background: checked.has(i) ? "#16A34A" : riskColor }}>
              {checked.has(i) ? "✓" : i + 1}
            </div>
            <span className="text-sm leading-relaxed"
              style={{
                color: "var(--bark)",
                textDecoration: checked.has(i) ? "line-through" : "none",
              }}>
              {item}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geocode helper
// ---------------------------------------------------------------------------

async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  // Open-Meteo only does city-name lookup — strip ", CA"-style suffixes first
  const cityName = location.split(",")[0].trim();

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
    );
    const data = await res.json();
    if (data.results?.length)
      return { lat: data.results[0].latitude, lon: data.results[0].longitude };
  } catch { /* try next */ }

  // Nominatim handles "City, State" and zip codes natively
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { "User-Agent": "FireReadyFarm/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0)
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { /* give up */ }

  return null;
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function ResultsContent() {
  const params = useSearchParams();
  const location     = params.get("location")     || "Your Property";
  const propertyType = params.get("propertyType") || "farm";

  const propertyScore = useMemo(() => computePropertyScore(params), [params]);

  const imageRisk = useMemo(() => {
    const raw = params.get("imageRisk");
    return raw !== null ? Number(raw) : null;
  }, [params]);

  const imageFindings = useMemo((): ImageFinding[] | null => {
    const raw = params.get("imageFindings");
    if (!raw) return null;
    try { return JSON.parse(raw) as ImageFinding[]; } catch { return null; }
  }, [params]);

  const imageDebug = useMemo((): ModelDebugInfo | null => {
    const raw = params.get("imageDebug");
    if (!raw) return null;
    try { return JSON.parse(raw) as ModelDebugInfo; } catch { return null; }
  }, [params]);

  const imageModels = useMemo((): string[] => {
    const raw = params.get("imageModels");
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }, [params]);

  const [weatherData, setWeatherData]       = useState<WeatherApiResponse | null>(null);
  const [weatherError, setWeatherError]     = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  const finalScore = useMemo(() => {
    if (weatherData && imageRisk !== null)
      return Math.round(propertyScore * 0.65 + weatherData.risk.score * 0.25 + imageRisk * 0.10);
    if (weatherData)
      return Math.round(propertyScore * 0.75 + weatherData.risk.score * 0.25);
    if (imageRisk !== null)
      return Math.round(propertyScore * 0.85 + imageRisk * 0.15);
    return propertyScore;
  }, [propertyScore, weatherData, imageRisk]);

  const risk      = getRiskMeta(finalScore);
  const checklist = CHECKLISTS[risk.tier];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWeatherLoading(true);
      setWeatherError(null);
      const coords = await geocode(location);
      if (!coords) {
        if (!cancelled) { setWeatherError("Could not geocode location"); setWeatherLoading(false); }
        return;
      }
      try {
        const res = await fetch(`/api/weather?lat=${coords.lat}&lon=${coords.lon}`);
        if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
        const data: WeatherApiResponse = await res.json();
        if (!cancelled) setWeatherData(data);
      } catch (e) {
        if (!cancelled) setWeatherError(String(e));
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [location]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="animate-rise text-center mb-10">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-widest
          uppercase mb-4" style={{ background: risk.bg, color: risk.color }}>
          Wildfire Risk Report
        </span>
        <h1 className="font-display text-4xl font-bold mb-2" style={{ color: "var(--smoke)" }}>
          {location}
        </h1>
        <p className="text-sm capitalize" style={{ color: "var(--clay)" }}>
          {propertyType.replace(/-/g, " ")} ·{" "}
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Score hero */}
      <ScoreHero
        score={finalScore}
        risk={risk}
        propertyScore={propertyScore}
        weatherScore={weatherData?.risk.score ?? null}
        imageScore={imageRisk}
      />

      {/* AI Image Findings */}
      {imageFindings && (
        <div className="animate-rise-2 mb-8">
          <ImageFindingsPanel
              findings={imageFindings}
              score={imageRisk ?? 0}
              debug={imageDebug}
              modelsUsed={imageModels}
            />
        </div>
      )}

      {/* Live weather */}
      <div className="animate-rise-3 mb-8">
        <h2 className="font-display text-2xl font-bold mb-4" style={{ color: "var(--smoke)" }}>
          Live Weather Risk
        </h2>
        {weatherLoading ? (
          <div className="rounded-2xl p-8 flex items-center justify-center gap-3"
            style={{ background: "white", border: "1px solid #E7E5E4" }}>
            <span className="spin-slow text-2xl">🔥</span>
            <span className="text-sm" style={{ color: "var(--clay)" }}>
              Fetching live weather for {location}…
            </span>
          </div>
        ) : weatherData ? (
          <>
            <WeatherPanel data={weatherData} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FactorBar icon="🌡️" label="Temperature"
                score={weatherData.risk.components.temperatureScore}   weight={25 * 0.25} />
              <FactorBar icon="💦" label="Relative Humidity"
                score={weatherData.risk.components.humidityScore}      weight={25 * 0.40} />
              <FactorBar icon="💨" label="Wind Speed"
                score={weatherData.risk.components.windScore}          weight={25 * 0.25} />
              <FactorBar icon="🌧️" label="Precipitation"
                score={weatherData.risk.components.precipitationScore} weight={25 * 0.10} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl p-5 text-sm"
            style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
            Could not load live weather ({weatherError}). Score is based on property factors only.
          </div>
        )}
      </div>

      {/* Property factors */}
      <div className="animate-rise-4 mb-8">
        <h2 className="font-display text-2xl font-bold mb-4" style={{ color: "var(--smoke)" }}>
          Property Factor Breakdown
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {PROPERTY_FACTORS.map((f) => (
            <FactorBar key={f.id} icon={f.icon} label={f.label}
              score={getPropertyFactorScore(f.id, params)} weight={f.weight} />
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="animate-rise-5 mb-8">
        <h2 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--smoke)" }}>
          Your Action Checklist
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--clay)" }}>
          {checklist.length} recommended actions for {risk.label.toLowerCase()} properties
          · click to mark complete
        </p>
        <ChecklistSection items={checklist} riskColor={risk.color} />
      </div>

      {/* CTA */}
      <div className="animate-rise-5 rounded-2xl p-6 text-center"
        style={{ background: "linear-gradient(135deg, var(--smoke), var(--ash))" }}>
        <p className="font-display text-xl text-white font-semibold mb-1">Share this report</p>
        <p className="text-sm text-stone-400 mb-4">
          Print or export for your insurance provider or local fire department.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => window.print()}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all
              hover:opacity-80"
            style={{ border: "1.5px solid rgba(255,255,255,0.3)" }}>
            Print Report
          </button>
          <Link href="/assess"
            className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: "var(--ember)", color: "white" }}>
            New Assessment
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function ResultsPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--parchment)" }}>
      <nav className="flex items-center justify-between px-8 py-5 border-b border-stone-200 bg-white">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl flicker">🔥</span>
          <span className="font-display text-xl font-semibold" style={{ color: "var(--smoke)" }}>
            FireReady<span style={{ color: "var(--ember)" }}>Farm</span>
          </span>
        </Link>
        <Link href="/assess"
          className="text-sm font-medium px-4 py-2 rounded-full hover:bg-stone-100 transition-colors"
          style={{ color: "var(--clay)" }}>
          ← New Assessment
        </Link>
      </nav>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <span className="text-4xl spin-slow">🔥</span>
        </div>
      }>
        <ResultsContent />
      </Suspense>
    </main>
  );
}
