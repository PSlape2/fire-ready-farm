import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@huggingface/transformers";
import sharp from "sharp";
import type { ImageFinding, ModelDebugInfo } from "../../../lib/scoring";

export interface ImageAnalysisResult {
  score: number;
  findings: ImageFinding[];
  summary: string;
  method: "ensemble" | "vqa" | "caption";
  modelsUsed: string[];
  debug: ModelDebugInfo;
}

// ---------------------------------------------------------------------------
// Local ONNX pipeline singletons
// ---------------------------------------------------------------------------

const CAPTION_MODEL = "Xenova/blip-image-captioning-large";
const CLIP_MODEL    = "Xenova/clip-vit-base-patch32";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _captionPipe: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _clipPipe: any = null;

async function getCaptionPipe() {
  if (!_captionPipe) _captionPipe = await pipeline("image-to-text", CAPTION_MODEL, { device: "cpu" });
  return _captionPipe;
}
async function getClipPipe() {
  if (!_clipPipe) _clipPipe = await pipeline("zero-shot-image-classification", CLIP_MODEL, { device: "cpu" });
  return _clipPipe;
}

// ---------------------------------------------------------------------------
// Hazard config — binary characteristic checks with fixed point values
// ---------------------------------------------------------------------------
// Each characteristic: CLIP classifies [pos, neg].
// If pos wins (posScore > negScore) → characteristic IS detected → add `points` to hazard score.
// Hazard score = Σ detected points, capped at 1.0.
// ---------------------------------------------------------------------------

interface Characteristic {
  pos: string;    // visual description when the hazard IS present
  neg: string;    // visual description when it is NOT present
  points: number; // fixed contribution to hazard score (0–1) if detected
}

const HAZARDS = [
  {
    id: "dry_vegetation",
    label: "Dry Vegetation",
    hazardWeight: 0.30,
    checks: [
      { pos: "dry brown dead grass covering the ground",   neg: "green healthy lush grass",              points: 0.40 },
      { pos: "yellowed withered dried-out vegetation",     neg: "thriving moist green plants",           points: 0.35 },
      { pos: "drought-parched barren cracked dry field",   neg: "well-watered irrigated green farmland", points: 0.25 },
    ] as Characteristic[],
    description: "Dry or dead plant material — primary wildfire ignition fuel",
  },
  {
    id: "dense_brush",
    label: "Dense Brush",
    hazardWeight: 0.20,
    checks: [
      { pos: "dense tangled shrub thicket overgrown brush",  neg: "open cleared maintained land",          points: 0.40 },
      { pos: "thick chaparral undergrowth impenetrable bush", neg: "sparse trimmed low-growing shrubs",    points: 0.35 },
      { pos: "heavy overgrown vegetation encroaching field",  neg: "mowed manicured open landscape",       points: 0.25 },
    ] as Characteristic[],
    description: "Dense brush detected — enables rapid fire spread",
  },
  {
    id: "trees_near_structures",
    label: "Trees Near Structures",
    hazardWeight: 0.20,
    checks: [
      { pos: "large tree growing directly next to a building",   neg: "building with clear open space no trees nearby", points: 0.40 },
      { pos: "tree branches overhanging the roof of a structure", neg: "clear sky above building roof no overhanging branches", points: 0.35 },
      { pos: "dense trees forest immediately adjacent to house barn", neg: "house surrounded by wide open yard no trees", points: 0.25 },
    ] as Characteristic[],
    description: "Trees near structures — increases ember ignition risk",
  },
  {
    id: "flammable_objects",
    label: "Flammable Objects",
    hazardWeight: 0.15,
    checks: [
      { pos: "hay bales stacked stored near a barn or building", neg: "clean empty field no hay bales visible",       points: 0.40 },
      { pos: "large wood pile or stacked lumber stored outdoors", neg: "clear clean empty yard no wood storage",      points: 0.35 },
      { pos: "propane tank or fuel barrel stored near structure", neg: "no fuel containers or flammable storage outside", points: 0.25 },
    ] as Characteristic[],
    description: "Combustible materials near or adjacent to structures",
  },
  {
    id: "poor_defensible_space",
    label: "Poor Defensible Space",
    hazardWeight: 0.15,
    checks: [
      { pos: "tall vegetation growing directly against house wall",    neg: "cleared bare gravel zone around house perimeter",    points: 0.40 },
      { pos: "overgrown plants touching and covering building exterior", neg: "mowed short grass lawn around structure",           points: 0.35 },
      { pos: "no clear defensible buffer space visible around structure", neg: "wide cleared firebreak buffer surrounding building", points: 0.25 },
    ] as Characteristic[],
    description: "Insufficient cleared buffer zone around structures",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSeverity(s: number): "low" | "moderate" | "high" {
  if (s >= 0.65) return "high";
  if (s >= 0.38) return "moderate";
  return "low";
}

function computeOverallScore(scores: number[]): number {
  return Math.min(100, Math.round(HAZARDS.reduce((sum, h, i) => sum + h.hazardWeight * scores[i] * 100, 0)));
}

function buildSummary(findings: ImageFinding[]): string {
  const n = findings.filter((f) => f.detected).length;
  if (n >= 4) return "Multiple critical fire hazards detected. Immediate mitigation recommended.";
  if (n >= 2) return "Several fire risk factors identified. Targeted action recommended.";
  if (n === 1) return "One hazard detected. Monitor and address proactively.";
  return "No major visual hazards detected. Continue regular monitoring.";
}

// ---------------------------------------------------------------------------
// Color-analysis fallback — no model required
// ---------------------------------------------------------------------------

async function colorAnalysisFallback(imageBytes: ArrayBuffer): Promise<number[]> {
  const buf = Buffer.from(imageBytes);
  const { data, info } = await sharp(buf)
    .resize(200, 200, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = info.width * info.height;
  let green = 0, brownYellow = 0, treeGreen = 0, gray = 0;

  for (let i = 0; i < data.length; i += 3) {
    const rN = data[i] / 255, gN = data[i + 1] / 255, bN = data[i + 2] / 255;
    const cmax = Math.max(rN, gN, bN), cmin = Math.min(rN, gN, bN);
    const delta = cmax - cmin;
    const l = (cmax + cmin) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (delta > 0) {
      if (cmax === rN)      h = ((gN - bN) / delta % 6) * 60;
      else if (cmax === gN) h = ((bN - rN) / delta + 2) * 60;
      else                  h = ((rN - gN) / delta + 4) * 60;
      if (h < 0) h += 360;
    }
    if (s > 0.12 && l > 0.08 && l < 0.92) {
      if (h >= 75 && h <= 165)       { green++; if (l < 0.42) treeGreen++; }
      else if (h > 20 && h < 75)     brownYellow++;
      else if (h <= 20 && rN > 0.35) brownYellow++;
    }
    if (s < 0.18 && l > 0.25 && l < 0.80) gray++;
  }

  const gR = green / total, byR = brownYellow / total, trR = treeGreen / total, gyR = gray / total;
  const vegR = gR + byR;
  return [
    Math.min(1, byR * 4.0 + Math.max(0, 0.5 - gR) * 0.6),
    Math.min(1, vegR * 2.5),
    Math.min(1, trR * 3.0 + (gyR > 0.05 && trR > 0.08 ? 0.3 : 0)),
    Math.min(1, gyR * 1.2 + byR * 0.5),
    Math.min(1, vegR > 0.35 && gyR > 0.04 ? vegR * 1.6 : vegR * 0.7),
  ];
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let imageBytes: ArrayBuffer;
  let mimeType = "image/jpeg";
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "No valid image provided" }, { status: 400 });
    }
    mimeType = file.type;
    imageBytes = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to parse upload" }, { status: 400 });
  }

  const dataUrl = `data:${mimeType};base64,${Buffer.from(imageBytes).toString("base64")}`;

  // Initialize pipelines in parallel (downloads & caches on first call)
  const [clipResult, captionResult] = await Promise.allSettled([getClipPipe(), getCaptionPipe()]);
  const clipPipe    = clipResult.status    === "fulfilled" ? clipResult.value    : null;
  const captionPipe = captionResult.status === "fulfilled" ? captionResult.value : null;

  // BLIP caption (for debug display)
  let blipCaption: string | null = null;
  if (captionPipe) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = await captionPipe(dataUrl) as any[];
      blipCaption = out[0]?.generated_text ?? null;
    } catch { /* non-fatal */ }
  }

  // Per-hazard binary characteristic checks via CLIP
  type QuestionRow = { question: string; answer: string | null; apiScore: number | null; negScore: number | null; score: number | null };
  type HazardRow   = { id: string; questions: QuestionRow[]; scores: { vqa: number | null; blip: null; vit: null; final: number } };
  const hazardData: HazardRow[] = [];
  const finalScores: number[] = [];

  for (const h of HAZARDS) {
    const questions: QuestionRow[] = [];
    let hazardScore = 0;

    for (const check of h.checks) {
      if (!clipPipe) {
        questions.push({ question: check.pos, answer: null, apiScore: null, negScore: null, score: null });
        continue;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await clipPipe(dataUrl, [check.pos, check.neg]) as { label: string; score: number }[];
        const scoreMap = new Map(raw.map((r) => [r.label, r.score]));
        const posScore = scoreMap.get(check.pos) ?? 0;
        const negScore = scoreMap.get(check.neg) ?? 0;
        const detected = posScore > negScore;
        const points   = detected ? check.points : 0;
        hazardScore   += points;
        questions.push({
          question: check.pos,
          answer:   detected ? "detected" : "not detected",
          apiScore: posScore,
          negScore: negScore,
          score:    points,
        });
      } catch {
        questions.push({ question: check.pos, answer: null, apiScore: null, negScore: null, score: null });
      }
    }

    const cappedScore = Math.min(1, hazardScore);
    finalScores.push(cappedScore);
    hazardData.push({
      id: h.id,
      questions,
      scores: { vqa: cappedScore, blip: null, vit: null, final: cappedScore },
    });
  }

  const clipWorked = hazardData.some((d) => d.questions.some((q) => q.answer !== null));
  const modelsUsed: string[] = [
    ...(blipCaption !== null ? ["BLIP-Large Caption"] : []),
    ...(clipWorked           ? ["CLIP ViT-B/32"]      : []),
  ];

  // Fall back to color analysis if CLIP failed entirely
  let usedScores = finalScores;
  if (!clipWorked) {
    usedScores = await colorAnalysisFallback(imageBytes);
    modelsUsed.push("color-analysis");
    // patch hazardData scores
    usedScores.forEach((s, i) => {
      hazardData[i].scores.vqa   = s;
      hazardData[i].scores.final = s;
    });
  }

  const findings: ImageFinding[] = HAZARDS.map((h, i) => ({
    id: h.id,
    label: h.label,
    detected: usedScores[i] >= 0.30,
    severity: toSeverity(usedScores[i]),
    description: h.description,
  }));

  const debug: ModelDebugInfo = {
    blipCaption,
    vitCaption: null,
    hazards: hazardData,
  };

  return NextResponse.json({
    score:      computeOverallScore(usedScores),
    findings,
    summary:    buildSummary(findings),
    method:     clipWorked ? "ensemble" : "caption",
    modelsUsed,
    debug,
  } satisfies ImageAnalysisResult);
}
