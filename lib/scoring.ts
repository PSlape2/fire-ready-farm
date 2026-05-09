export type RiskLevel = "Low" | "Moderate" | "High" | "Extreme";

export interface ImageFinding {
  id: string;
  label: string;
  detected: boolean;
  severity: "low" | "moderate" | "high";
  description: string;
}

export interface VQAQuestionResult {
  question: string;       // characteristic label being checked
  answer: string | null;  // "detected" | "not detected" | null
  apiScore: number | null; // positive label CLIP similarity
  negScore?: number | null; // negative label CLIP similarity
  score: number | null;   // fixed points added (0 or characteristic.points)
}

export interface HazardDebug {
  id: string;
  questions: VQAQuestionResult[];
  scores: { vqa: number | null; blip: number | null; vit: number | null; final: number };
}

export interface ModelDebugInfo {
  blipCaption: string | null;
  vitCaption: string | null;
  hazards: HazardDebug[];
}

export interface WildfireRiskInput {
  temperature: number;     // °F
  humidity: number;        // % relative humidity
  windSpeed: number;       // mph
  precipitation: number;   // inches (recent/last hour)
  vegetationRisk: number;  // 0–100
  fireHistoryRisk: number; // 0–100
  imageRisk: number;       // 0–100
}

export interface RiskFactor {
  name: string;
  score: number;           // 0–100 component score
  weight: number;          // fraction of composite (0–1)
}

export interface WildfireRiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];   // main risk drivers, sorted by weighted contribution desc
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Component scorers — each returns 0–100
// ---------------------------------------------------------------------------

function scoreTemperature(tempF: number): number {
  if (tempF >= 110) return 100;
  if (tempF >= 100) return 85 + (tempF - 100) * 1.5;
  if (tempF >= 85)  return 55 + (tempF - 85) * 2;
  if (tempF >= 70)  return 25 + (tempF - 70) * 2;
  if (tempF >= 50)  return 10 + (tempF - 50) * 0.75;
  return 0;
}

function scoreHumidity(rh: number): number {
  // inverted — low RH = high risk
  if (rh <= 10)  return 100;
  if (rh <= 15)  return 90 + (15 - rh) * 2;
  if (rh <= 25)  return 70 + (25 - rh) * 2;
  if (rh <= 40)  return 40 + (40 - rh) * 2;
  if (rh <= 60)  return 15 + (60 - rh) * 1.25;
  return 0;
}

function scoreWindSpeed(mph: number): number {
  if (mph >= 60) return 100;
  if (mph >= 40) return 80 + (mph - 40) * 1;
  if (mph >= 25) return 55 + (mph - 25) * (25 / 15);
  if (mph >= 15) return 25 + (mph - 15) * 3;
  if (mph >= 5)  return 5  + (mph - 5)  * 2;
  return 0;
}

function scorePrecipitation(inches: number): number {
  // inverted — more rain = lower risk
  if (inches <= 0)    return 100;
  if (inches < 0.02)  return 80;
  if (inches < 0.10)  return 50;
  if (inches < 0.25)  return 20;
  return 0;
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Recommendations by tier
// ---------------------------------------------------------------------------

const RECOMMENDATIONS: Record<RiskLevel, string[]> = {
  Extreme: [
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
  High: [
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
  Moderate: [
    "Establish a 30-ft defensible space around all structures",
    "Create a firebreak along the property border facing prevailing winds",
    "Store hay and combustibles at least 50 ft from structures",
    "Ensure driveway is wide enough for emergency vehicles (12 ft min)",
    "Install exterior sprinklers on main structures",
    "Keep a stockpile of fire tools: shovels, rakes, fire extinguishers",
    "Conduct a yearly property fire risk review each spring",
    "Register livestock with your county emergency management office",
  ],
  Low: [
    "Conduct an annual property walkthrough for fire hazards",
    "Maintain existing firebreaks and defensible space",
    "Review and update your emergency evacuation plan",
    "Keep emergency water supply stocked",
    "Stay informed with local fire weather alerts",
  ],
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Computes a composite wildfire risk score (0–100) from weather, vegetation,
 * fire history, and image analysis inputs. Humidity is the highest-weighted
 * factor (25%), followed by temperature and vegetation (20% / 15%). Returns
 * the top contributing risk factors and a tier-appropriate recommendation list.
 */
export function computeWildfireRisk(input: WildfireRiskInput): WildfireRiskResult {
  const components: Array<{ name: string; score: number; weight: number }> = [
    { name: "Humidity",       score: clamp(scoreHumidity(input.humidity)),           weight: 0.25 },
    { name: "Temperature",    score: clamp(scoreTemperature(input.temperature)),     weight: 0.20 },
    { name: "Vegetation",     score: clamp(input.vegetationRisk),                    weight: 0.15 },
    { name: "Wind Speed",     score: clamp(scoreWindSpeed(input.windSpeed)),         weight: 0.15 },
    { name: "Fire History",   score: clamp(input.fireHistoryRisk),                   weight: 0.10 },
    { name: "Precipitation",  score: clamp(scorePrecipitation(input.precipitation)), weight: 0.10 },
    { name: "Image Analysis", score: clamp(input.imageRisk),                         weight: 0.05 },
  ];

  const composite = clamp(
    components.reduce((sum, c) => sum + c.score * c.weight, 0)
  );

  const level: RiskLevel =
    composite >= 75 ? "Extreme"
    : composite >= 55 ? "High"
    : composite >= 35 ? "Moderate"
    : "Low";

  // Main risk factors: score >= 50, sorted by weighted contribution descending.
  // Always include at least the top 2 even if scores are low.
  const sorted = [...components].sort((a, b) => b.score * b.weight - a.score * a.weight);
  const significant = sorted.filter((c) => c.score >= 50);
  const factors: RiskFactor[] = (significant.length >= 2 ? significant : sorted.slice(0, 2)).map(
    ({ name, score, weight }) => ({ name, score, weight })
  );

  return {
    score: composite,
    level,
    factors,
    recommendations: RECOMMENDATIONS[level],
  };
}
