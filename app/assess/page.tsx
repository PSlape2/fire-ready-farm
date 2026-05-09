"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ImageFinding } from "../../lib/scoring";

const PROPERTY_TYPES = [
  { value: "ranch", label: "Cattle Ranch" },
  { value: "vineyard", label: "Vineyard / Winery" },
  { value: "row-crop", label: "Row Crop Farm" },
  { value: "orchard", label: "Orchard / Fruit Farm" },
  { value: "hay", label: "Hay / Grain Farm" },
  { value: "goat-sheep", label: "Goat / Sheep Farm" },
  { value: "mixed", label: "Mixed-Use / Hobby Farm" },
  { value: "timber", label: "Timber / Woodlot" },
];

const DEMO_FORM = {
  location: "Redding, CA",
  propertyType: "ranch",
  acreage: "200+",
  structureCount: "6–10",
  waterSource: "none",
  hasFirebreak: "no",
  vegetationType: "chaparral",
  image: null as File | null,
  imageName: "",
};

const DEMO_FINDINGS: ImageFinding[] = [
  {
    id: "dry_vegetation",
    label: "Dry Vegetation",
    detected: true,
    severity: "high",
    description: "Extensive dry grass and brown vegetation covering most of the property",
  },
  {
    id: "dense_brush",
    label: "Dense Brush",
    detected: true,
    severity: "high",
    description: "Dense chaparral and scrub visible along property borders and hillsides",
  },
  {
    id: "trees_near_structures",
    label: "Trees Near Structures",
    detected: true,
    severity: "moderate",
    description: "Several large oaks and pines within 30 ft of main barn and residence",
  },
  {
    id: "flammable_objects",
    label: "Flammable Objects",
    detected: true,
    severity: "moderate",
    description: "Hay bales and wood pile stored immediately adjacent to outbuilding",
  },
  {
    id: "poor_defensible_space",
    label: "Poor Defensible Space",
    detected: true,
    severity: "high",
    description: "Vegetation grows directly up to structure walls — no cleared buffer",
  },
];

// ---------------------------------------------------------------------------
// Mode selection screen
// ---------------------------------------------------------------------------

function ModeSelect({ onQuick }: { onQuick: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <span className="text-4xl block mb-4">🔥</span>
        <h1 className="font-display text-4xl font-bold mb-3" style={{ color: "var(--smoke)" }}>
          Assess Your Property
        </h1>
        <p className="text-base max-w-md mx-auto" style={{ color: "var(--clay)" }}>
          Choose how you want to evaluate your wildfire risk. Both modes are free.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Quick Assessment */}
        <div
          className="bg-white rounded-3xl p-8 flex flex-col"
          style={{ border: "1px solid #E7E5E4", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          <span className="text-4xl mb-5 block">📋</span>
          <h2 className="font-display text-2xl font-bold mb-3" style={{ color: "var(--smoke)" }}>
            Quick Assessment
          </h2>
          <p className="text-sm leading-relaxed flex-1 mb-8" style={{ color: "var(--clay)" }}>
            Answer a few questions and upload a photo to get your property risk report.
            Takes about 2 minutes. Includes AI image analysis and live weather data.
          </p>
          <button
            onClick={onQuick}
            className="w-full py-3 rounded-full text-white text-sm font-semibold
              transition-all hover:opacity-90"
            style={{ background: "var(--ember)" }}>
            Start Assessment →
          </button>
        </div>

        {/* Live Deep Scan */}
        <div
          className="rounded-3xl p-8 flex flex-col"
          style={{
            background: "linear-gradient(135deg, #1C1917, #292524)",
            border: "1px solid #44403C",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          }}>
          <span className="text-4xl mb-5 block">🔴</span>
          <h2 className="font-display text-2xl font-bold mb-3" style={{ color: "#E7E5E4" }}>
            Live Deep Scan
          </h2>
          <p className="text-sm leading-relaxed flex-1 mb-8" style={{ color: "#A8A29E" }}>
            Point your camera at your property for real-time AI hazard detection with
            live weather data. Requires camera access and the detection backend running.
          </p>
          <a
            href="/test.html"
            target="_blank"
            rel="noreferrer"
            className="w-full block text-center py-3 rounded-full text-sm font-semibold
              transition-all hover:opacity-90"
            style={{ background: "var(--ember)", color: "white" }}>
            Open Live Scanner →
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AssessPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"quick" | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEMO_FORM);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Analyzing your property...");

  const set = (k: string, v: string | File | null) => setForm((f) => ({ ...f, [k]: v }));

  const handleFile = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      set("image", file);
      set("imageName", file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDemo = () => {
    const params = new URLSearchParams({
      location: DEMO_FORM.location,
      propertyType: DEMO_FORM.propertyType,
      acreage: DEMO_FORM.acreage,
      structureCount: DEMO_FORM.structureCount,
      waterSource: DEMO_FORM.waterSource,
      hasFirebreak: DEMO_FORM.hasFirebreak,
      vegetationType: DEMO_FORM.vegetationType,
      imageRisk: "85",
      imageFindings: JSON.stringify(DEMO_FINDINGS),
    });
    router.push(`/results?${params.toString()}`);
  };

  /**
   * Orchestrates the assessment pipeline: geocodes the location, fetches nearby
   * fire history from NOAA, optionally runs AI image analysis, then navigates to
   * the results page with all collected data encoded as URL search params.
   */
  const handleSubmit = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      location: form.location,
      propertyType: form.propertyType,
      acreage: form.acreage,
      waterSource: form.waterSource,
      hasFirebreak: form.hasFirebreak,
      vegetationType: form.vegetationType,
      structureCount: form.structureCount,
    });

    // Geocode location and get fire history
    try {
      setLoadingMsg("Getting location coordinates...");
      const geocodeRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.location)}&limit=1`
      );
      const geocodeData = await geocodeRes.json();
      
      if (geocodeData && geocodeData.length > 0) {
        const { lat, lon } = geocodeData[0];
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        params.set("latitude", lat);
        params.set("longitude", lon);

        setLoadingMsg("Checking fire history...");
        // Search for fire history within ~100km range (approximately 1 degree lat/lon)
        const latRange = 0.5; // ~50km radius
        const lonRange = 0.5; // ~50km radius

        let latMin = Math.round(latNum - latRange);
        let latMax = Math.round(latNum + latRange);
        let lonMin = Math.round(lonNum - lonRange);
        let lonMax = Math.round(lonNum + lonRange);

        if(latMin === latMax) latMax += 1;
        if(lonMin === lonMax) lonMax += 1;
        
        const fireHistoryRes = await fetch(
          `/api/fire-history?dataTypeId=12&minLat=${latMin}&maxLat=${latMax}&minLon=${lonMin}&maxLon=${lonMax}&headersOnly=true&limit=20&earliestYear=2016&timeFormat=BP&timeMethod=entireOver`
        );
        
        if (fireHistoryRes.ok) {
          const fireHistoryData = await fireHistoryRes.json();
          params.set("fireHistoryCount", String(fireHistoryData.count || 0));
          // params.set("fireHistoryData", JSON.stringify(fireHistoryData.data || {}));
        }
      }
    } catch (error) {
      console.error("Error getting fire history:", error);
      // proceed without fire history
    }

    if (form.image) {
      setLoadingMsg("Analyzing property image...");
      try {
        const fd = new FormData();
        fd.append("image", form.image);
        const res = await fetch("/api/analyze-image", { method: "POST", body: fd });
        if (res.ok) {
          const result = await res.json();
          params.set("imageRisk", String(result.score));
          params.set("imageFindings", JSON.stringify(result.findings));
          params.set("imageDebug", JSON.stringify(result.debug));
          params.set("imageModels", JSON.stringify(result.modelsUsed));
        }
      } catch {
        // proceed without image analysis
      }
    }

    setLoadingMsg("Calculating risk score...");
    router.push(`/results?${params.toString()}`);
  };

  const step1Valid = form.location.length > 2 && !!form.propertyType;
  const step2Valid = !!form.acreage && !!form.waterSource;
  const step3Valid = !!form.vegetationType && !!form.hasFirebreak;

  return (
    <main className="min-h-screen" style={{ background: "var(--parchment)" }}>
      <nav className="flex items-center justify-between px-8 py-5 border-b border-stone-200 bg-white">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl flicker">🔥</span>
          <span className="font-display text-xl font-semibold" style={{ color: "var(--smoke)" }}>
            FireReady<span style={{ color: "var(--ember)" }}>Farm</span>
          </span>
        </Link>
        <span className="text-sm" style={{ color: "var(--clay)" }}>Property Risk Assessment</span>
      </nav>

      {/* Mode selection */}
      {mode === null && <ModeSelect onQuick={() => setMode("quick")} />}

      {/* Quick assessment form */}
      {mode === "quick" && (
        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Back link */}
          <button
            onClick={() => { setMode(null); setStep(1); }}
            className="flex items-center gap-1 text-sm mb-6 transition-colors hover:opacity-70"
            style={{ color: "var(--clay)" }}>
            ← Back
          </button>

          {/* Demo banner */}
          <div className="mb-5 rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
            style={{ background: "linear-gradient(135deg, #1C1917, #292524)", border: "1px solid #44403C" }}>
            <div>
              <p className="text-sm font-semibold text-white">Hackathon Demo</p>
              <p className="text-xs" style={{ color: "#A8A29E" }}>
                Load a high-risk sample report instantly
              </p>
            </div>
            <button
              onClick={handleDemo}
              className="flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold transition-all hover:opacity-90 pulse-ember"
              style={{ background: "var(--ember)", color: "white" }}>
              Try Demo →
            </button>
          </div>

          {/* Progress */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-3">
              {["Property Info", "Infrastructure", "Vegetation & Hazards"].map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                      ${step > i + 1 ? "text-white" : step === i + 1 ? "text-white" : "text-stone-400"}`}
                    style={{
                      background:
                        step > i + 1 ? "var(--sage)" : step === i + 1 ? "var(--ember)" : "#E7E5E4",
                    }}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span
                    className="text-xs hidden sm:block"
                    style={{ color: step === i + 1 ? "var(--smoke)" : "var(--clay)" }}>
                    {label}
                  </span>
                  {i < 2 && (
                    <div
                      className="w-8 sm:w-16 h-0.5 mx-2"
                      style={{ background: step > i + 1 ? "var(--sage)" : "#E7E5E4" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-sm p-8 relative" style={{ border: "1px solid #E7E5E4" }}>
            {/* Step 1 */}
            {step === 1 && (
              <div className="animate-rise">
                <h2 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--smoke)" }}>
                  Property Info
                </h2>
                <p className="text-sm mb-8" style={{ color: "var(--clay)" }}>
                  Tell us where your property is and what you grow.
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Property Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Napa, CA or Zip Code 94558"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all"
                      style={{ border: "1.5px solid #E7E5E4", background: "var(--parchment)" }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Property Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PROPERTY_TYPES.map((pt) => (
                        <button
                          key={pt.value}
                          onClick={() => set("propertyType", pt.value)}
                          className="text-left px-4 py-3 rounded-xl text-sm transition-all font-medium"
                          style={{
                            border:
                              form.propertyType === pt.value
                                ? "2px solid var(--ember)"
                                : "1.5px solid #E7E5E4",
                            background:
                              form.propertyType === pt.value ? "#FEE2D5" : "var(--parchment)",
                            color:
                              form.propertyType === pt.value ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {pt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Aerial / Property Photo{" "}
                      <span className="font-normal" style={{ color: "#A8A29E" }}>
                        — optional, AI-analyzed
                      </span>
                    </label>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className="cursor-pointer rounded-xl p-8 text-center transition-all"
                      style={{
                        border: dragging ? "2px dashed var(--ember)" : "2px dashed #D6D3D1",
                        background: dragging ? "#FEF3ED" : "var(--parchment)",
                      }}>
                      <input
                        ref={fileRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                      />
                      {form.imageName ? (
                        <div>
                          <span className="text-2xl block mb-2">✅</span>
                          <span className="text-sm font-medium" style={{ color: "var(--sage)" }}>
                            {form.imageName}
                          </span>
                          <p className="text-xs mt-1" style={{ color: "#A8A29E" }}>
                            Will be analyzed for fire hazards
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-2xl block mb-2">🖼️</span>
                          <p className="text-sm" style={{ color: "var(--clay)" }}>
                            Drag & drop or click to upload
                          </p>
                          <p className="text-xs mt-1" style={{ color: "#A8A29E" }}>
                            JPG, PNG, WEBP up to 10 MB · AI detects fire hazards
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="animate-rise">
                <h2 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--smoke)" }}>
                  Infrastructure
                </h2>
                <p className="text-sm mb-8" style={{ color: "var(--clay)" }}>
                  Help us understand your property size and resources.
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Property Size (acres)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {["< 10", "10–50", "50–200", "200+"].map((a) => (
                        <button
                          key={a}
                          onClick={() => set("acreage", a)}
                          className="py-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            border:
                              form.acreage === a ? "2px solid var(--ember)" : "1.5px solid #E7E5E4",
                            background: form.acreage === a ? "#FEE2D5" : "var(--parchment)",
                            color: form.acreage === a ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Number of Structures
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {["1", "2–5", "6–10", "10+"].map((n) => (
                        <button
                          key={n}
                          onClick={() => set("structureCount", n)}
                          className="py-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            border:
                              form.structureCount === n
                                ? "2px solid var(--ember)"
                                : "1.5px solid #E7E5E4",
                            background: form.structureCount === n ? "#FEE2D5" : "var(--parchment)",
                            color:
                              form.structureCount === n ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Primary Water Source
                    </label>
                    <div className="space-y-2">
                      {[
                        { v: "municipal", l: "Municipal / Public Water Supply" },
                        { v: "well", l: "Private Well" },
                        { v: "pond-creek", l: "Pond or Creek on Property" },
                        { v: "tank", l: "Water Storage Tank / Cistern" },
                        { v: "none", l: "Limited / No On-Site Water" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => set("waterSource", opt.v)}
                          className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            border:
                              form.waterSource === opt.v
                                ? "2px solid var(--ember)"
                                : "1.5px solid #E7E5E4",
                            background:
                              form.waterSource === opt.v ? "#FEE2D5" : "var(--parchment)",
                            color:
                              form.waterSource === opt.v ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="animate-rise">
                <h2 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--smoke)" }}>
                  Vegetation & Hazards
                </h2>
                <p className="text-sm mb-8" style={{ color: "var(--clay)" }}>
                  The final piece of your risk profile.
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Dominant Vegetation Type
                    </label>
                    <div className="space-y-2">
                      {[
                        { v: "chaparral", l: "Chaparral / Scrubland (high risk)" },
                        { v: "grassland", l: "Dry Grassland / Pasture (high risk)" },
                        { v: "mixed-forest", l: "Mixed Forest / Timber (medium risk)" },
                        { v: "irrigated-crops", l: "Irrigated Row Crops (lower risk)" },
                        { v: "vineyard-orchard", l: "Vineyard or Orchard (lower risk)" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => set("vegetationType", opt.v)}
                          className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all"
                          style={{
                            border:
                              form.vegetationType === opt.v
                                ? "2px solid var(--ember)"
                                : "1.5px solid #E7E5E4",
                            background:
                              form.vegetationType === opt.v ? "#FEE2D5" : "var(--parchment)",
                            color:
                              form.vegetationType === opt.v ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: "var(--bark)" }}>
                      Do you have a defensible space / firebreak?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "yes-full", l: "Yes, full" },
                        { v: "yes-partial", l: "Partial" },
                        { v: "no", l: "No" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => set("hasFirebreak", opt.v)}
                          className="py-3 px-2 rounded-xl text-sm font-medium transition-all text-center"
                          style={{
                            border:
                              form.hasFirebreak === opt.v
                                ? "2px solid var(--ember)"
                                : "1.5px solid #E7E5E4",
                            background:
                              form.hasFirebreak === opt.v ? "#FEE2D5" : "var(--parchment)",
                            color:
                              form.hasFirebreak === opt.v ? "var(--ember-dark)" : "var(--bark)",
                          }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl"
                style={{ background: "rgba(253,248,243,0.96)", zIndex: 10 }}>
                <div className="text-5xl mb-4 spin-slow">🔥</div>
                <p className="font-display text-xl font-semibold" style={{ color: "var(--smoke)" }}>
                  {loadingMsg}
                </p>
                <p className="text-sm mt-2" style={{ color: "var(--clay)" }}>
                  Checking fire history, wind patterns & vegetation risk
                </p>
              </div>
            )}

            {/* Navigation buttons */}
            <div
              className="flex items-center justify-between mt-8 pt-6"
              style={{ borderTop: "1px solid #E7E5E4" }}>
              <button
                onClick={() => setStep((s: number) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="px-5 py-2.5 rounded-full text-sm font-medium transition-all"
                style={{
                  color: step === 1 ? "#D6D3D1" : "var(--clay)",
                  cursor: step === 1 ? "not-allowed" : "pointer",
                }}>
                ← Back
              </button>

              {step < 3 ? (
                <button
                  onClick={() => setStep((s: number) => Math.min(3, s + 1))}
                  disabled={step === 1 ? !step1Valid : !step2Valid}
                  className="px-7 py-2.5 rounded-full text-white text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    background:
                      (step === 1 ? step1Valid : step2Valid) ? "var(--ember)" : "#D6D3D1",
                    cursor: (step === 1 ? step1Valid : step2Valid) ? "pointer" : "not-allowed",
                  }}>
                  Next Step →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!step3Valid || loading}
                  className="flex items-center gap-2 px-7 py-2.5 rounded-full text-white text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    background: step3Valid
                      ? "linear-gradient(135deg, var(--ember), var(--ember-dark))"
                      : "#D6D3D1",
                    cursor: step3Valid ? "pointer" : "not-allowed",
                  }}>
                  Generate Risk Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
