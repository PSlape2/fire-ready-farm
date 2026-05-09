import os
import math
import json
import logging
import traceback
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

app = FastAPI(title="Wildfire Defensible Space Hazard Detector", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_session_hazards: list[dict] = []


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    image_base64: str
    lat: float
    lon: float
    language: str = "en"


class ReportAddRequest(BaseModel):
    analysis: dict


# ---------------------------------------------------------------------------
# Fosberg Fire Weather Index
# ---------------------------------------------------------------------------

def _moisture_content(h: float, T: float) -> float:
    if h < 10:
        return 0.03229 + 0.281073 * h - 0.000578 * h * T
    elif h <= 50:
        return 2.22749 + 0.160107 * h - 0.01478 * T
    else:
        return 21.0606 + 0.005565 * h ** 2 - 0.00035 * h * T - 0.483199 * h


def calculate_ffwi(temperature_f: float, humidity_pct: float, wind_mph: float) -> tuple[float, str]:
    m = _moisture_content(humidity_pct, temperature_f)
    ratio = m / 30.0
    n = 1 - 2 * ratio + 1.5 * ratio ** 2 - 0.5 * ratio ** 3
    ffwi = n * math.sqrt(1 + wind_mph ** 2) / 0.3002

    if ffwi < 10:
        risk = "Low"
    elif ffwi < 25:
        risk = "Moderate"
    elif ffwi < 50:
        risk = "High"
    else:
        risk = "Extreme"

    return round(ffwi, 2), risk


# ---------------------------------------------------------------------------
# OpenWeatherMap
# ---------------------------------------------------------------------------

async def fetch_weather(lat: float, lon: float) -> dict:
    url = (
        f'https://api.open-meteo.com/v1/forecast'
        f'?latitude={lat}&longitude={lon}&current='
        f'temperature_2m,wind_speed_10m,relative_humidity_2m'
    )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    return {
        "temperature_f": round(data["current"]["temperature_2m"], 1),
        "humidity_pct": data["current"]["relative_humidity_2m"],
        "wind_mph": round(data["current"]["wind_speed_10m"], 1),
    }


# ---------------------------------------------------------------------------
# Groq LLaMA Vision hazard detection
# ---------------------------------------------------------------------------

_HAZARD_PROMPT = """You are a CAL FIRE defensible space expert and fire hazard recognition assistant analyzing an image for wildfire hazards.
Only report hazards that are clearly visible and genuinely dangerous fire risks. Do NOT report speculative, minor, or uncertain hazards. If the scene is safe with no hazards, return an empty array [] — do not invent hazards. An empty array is a valid and preferred response for safe scenes. If you are not confident a hazard exists, do not include it.
When analyzing the image, look for hazards across these three categories:

FUELS: Hay, straw, or bedding material such as sawdust or shredded newspaper. Dry or brown grass, dense vegetation, chaparral, or scrub. Trees or large shrubs within 30 feet of structures. Wood piles, lumber, or stored organic material. Horse blankets or fabric materials stored near heat sources. Paint, fertilizer, pesticides, or herbicides. Cobwebs, dust, or grain dust accumulation. Structures themselves, especially barns, which are both fuel sources and containers for ignition sources.
IGNITION SOURCES: Cigarettes, matches, or open flames. Welding equipment or machinery such as trucks, tractors, and mowers that produce sparks. Motors, heaters, or electrical appliances. Fence chargers, electrical fixtures, or exposed wiring. Batteries or electrical panels. Broken glass, which can focus sunlight. Chemicals that may react with each other, with water, or with moisture.

STRUCTURAL AND VEGETATION CONCERNS: Vegetation growing directly up to structure walls with no cleared buffer. Trees, shrubs, or dry grass in close proximity to buildings. Combustible materials stored immediately adjacent to structures. Poor defensible space conditions overall.

Return ONLY a valid JSON array. Each element must have:
 - "name": short hazard name
 - "location_in_image": where in the frame, for example "bottom left", "center", or "top right"
 - "severity": one of "severe" or "moderate" only — never "minor"
 - "action": one specific, concise, actionable sentence for removal or remediation

Example output:
[
   {
      "name": "Hay bales adjacent to outbuilding",
      "location_in_image": "bottom left",
      "severity": "severe",
      "action": "Relocate hay storage at least 30 feet from all structures immediately"
   },
   {
      "name": "Dense dry vegetation against structure wall",
      "location_in_image": "center right",
      "severity": "severe",
      "action": "Clear all vegetation within 0-5 feet of structure walls to create a non-combustible zone"
   },
   {
      "name": "Large trees within 30 feet of barn",
      "location_in_image": "top center",
      "severity": "moderate",
      "action": "Prune lower branches up to 10 feet from the ground to eliminate ladder fuels"
   }
]
"""

_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _parse_hazards(text: str) -> list[dict]:
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []


async def detect_hazards(image_base64: str) -> tuple[list[dict], str]:
    try:
        client = Groq(api_key=GROQ_API_KEY)
        response = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}},
                    {"type": "text", "text": _HAZARD_PROMPT},
                ],
            }],
            max_tokens=1024,
        )
        hazards = _parse_hazards(response.choices[0].message.content)
        log.info("Hazard detection via Groq LLaMA Vision succeeded")
        return hazards, _GROQ_MODEL
    except Exception:
        log.error("Groq Vision failed — full traceback:\n%s", traceback.format_exc())
        raise


# ---------------------------------------------------------------------------
# Urgency classification
# ---------------------------------------------------------------------------

_URGENCY_MATRIX = {
    ("Extreme", "severe"):   "MUST",
    ("Extreme", "moderate"): "MUST",
    ("High",    "severe"):   "MUST",
    ("High",    "moderate"): "COULD",
    ("Moderate","severe"):   "SHOULD",
    # Low + any severity and Moderate + moderate are excluded (filtered out)
}

_URGENCY_ORDER = {"MUST": 0, "SHOULD": 1, "COULD": 2, "MAY": 3}


def classify_hazards(hazards: list[dict], risk_level: str) -> list[dict]:
    classified = []
    for h in hazards:
        severity = h.get("severity", "moderate")
        urgency = _URGENCY_MATRIX.get((risk_level, severity))
        if urgency is None:
            continue
        classified.append({
            "name": h.get("name", "Unknown hazard"),
            "location_in_image": h.get("location_in_image", "unknown"),
            "urgency": urgency,
            "action": h.get("action", "Evaluate and remove if necessary"),
        })
    classified.sort(key=lambda x: _URGENCY_ORDER[x["urgency"]])
    return classified


def compute_scene_status(hazards: list[dict]) -> str:
    if not hazards:
        return "safe"
    urgencies = {h["urgency"] for h in hazards}
    if "MUST" in urgencies or "SHOULD" in urgencies:
        return "danger"
    return "attention"


def overall_score(risk_level: str, hazards: list[dict]) -> int:
    base = {"Low": 1, "Moderate": 2, "High": 3, "Extreme": 4}[risk_level]
    must_count = sum(1 for h in hazards if h["urgency"] == "MUST")
    return min(5, base + (1 if must_count > 0 else 0))


# ---------------------------------------------------------------------------
# Terminal pretty-print
# ---------------------------------------------------------------------------

_RISK_COLORS = {
    "Low": "\033[92m",
    "Moderate": "\033[93m",
    "High": "\033[91m",
    "Extreme": "\033[95m",
}
_RESET = "\033[0m"
_BOLD = "\033[1m"

_URGENCY_COLORS = {
    "MUST": "\033[91m",
    "SHOULD": "\033[93m",
    "COULD": "\033[94m",
    "MAY": "\033[92m",
}


def print_analysis(result: dict) -> None:
    risk = result["risk_level"]
    color = _RISK_COLORS.get(risk, "")
    w = result["weather"]
    print("\n" + "=" * 60)
    print(f"{_BOLD}Wildfire Hazard Analysis{_RESET}  [{result['timestamp']}]")
    print("=" * 60)
    print(
        f"  FFWI Score : {_BOLD}{result['ffwi_score']:.1f}{_RESET}   "
        f"Risk Level : {color}{_BOLD}{risk}{_RESET}"
    )
    print(
        f"  Temp: {w['temperature_f']}°F   "
        f"Humidity: {w['humidity_pct']}%   "
        f"Wind: {w['wind_mph']} mph"
    )
    print(f"  Overall Score : {result['overall_score']}/5")
    print("-" * 60)
    if result["hazards"]:
        print(f"  Detected Hazards ({len(result['hazards'])}):")
        for h in result["hazards"]:
            uc = _URGENCY_COLORS.get(h["urgency"], "")
            print(f"    [{uc}{h['urgency']}{_RESET}] {h['name']} — {h['location_in_image']}")
            print(f"           {h['action']}")
    else:
        print("  No hazards detected.")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# Startup self-test
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_checks() -> None:
    print("\n" + "=" * 60)
    print(f"{_BOLD}Wildfire Detector — Startup Checks{_RESET}")
    print("=" * 60)

    # 1. OpenWeatherMap
    try:
        weather = await fetch_weather(32.8801, -117.2340)
        print(
            f"  \033[92m[PASS]\033[0m OpenWeatherMap — "
            f"temp={weather['temperature_f']}°F  "
            f"humidity={weather['humidity_pct']}%  "
            f"wind={weather['wind_mph']} mph"
        )
    except Exception as exc:
        print(f"  \033[91m[FAIL]\033[0m OpenWeatherMap — {exc}")

    # 2. Groq API (text-only ping)
    try:
        client = Groq(api_key=GROQ_API_KEY)
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": "Reply with exactly one word: OK"}],
            max_tokens=10,
        )
        answer = resp.choices[0].message.content.strip()[:80]
        print(f"  \033[92m[PASS]\033[0m Groq API ({_GROQ_MODEL}) — response: {answer}")
    except Exception as exc:
        print(f"  \033[91m[FAIL]\033[0m Groq API — {exc}")

    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/weather")
async def weather_endpoint(lat: float, lon: float):
    try:
        weather = await fetch_weather(lat, lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather fetch failed: {exc}")
    ffwi_score, risk_level = calculate_ffwi(
        weather["temperature_f"], weather["humidity_pct"], weather["wind_mph"]
    )
    return {**weather, "ffwi_score": ffwi_score, "risk_level": risk_level}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    try:
        weather = await fetch_weather(req.lat, req.lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather fetch failed: {exc}")

    ffwi_score, risk_level = calculate_ffwi(
        weather["temperature_f"], weather["humidity_pct"], weather["wind_mph"]
    )

    try:
        raw_hazards, model_used = await detect_hazards(req.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision analysis failed: {exc}")

    hazards = classify_hazards(raw_hazards, risk_level)
    score = overall_score(risk_level, hazards)

    result = {
        "ffwi_score": ffwi_score,
        "risk_level": risk_level,
        "weather": weather,
        "hazards": hazards,
        "scene_status": compute_scene_status(hazards),
        "overall_score": score,
        "model_used": model_used,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    print_analysis(result)
    return result


@app.delete("/report")
async def report_reset():
    _session_hazards.clear()
    return {"status": "reset"}


@app.post("/report/add")
async def report_add(req: ReportAddRequest):
    _session_hazards.append(req.analysis)
    return {"status": "added", "total_frames": len(_session_hazards)}


@app.get("/report/summary")
async def report_summary():
    if not _session_hazards:
        return {"frames_analyzed": 0, "hazards": [], "highest_risk": None}

    best: dict[str, dict] = {}
    for frame in _session_hazards:
        for h in frame.get("hazards", []):
            name = h["name"]
            if name not in best or _URGENCY_ORDER[h["urgency"]] < _URGENCY_ORDER[best[name]["urgency"]]:
                best[name] = h

    deduped = sorted(best.values(), key=lambda x: _URGENCY_ORDER[x["urgency"]])

    risk_levels = [f.get("risk_level", "Low") for f in _session_hazards]
    risk_rank = {"Low": 0, "Moderate": 1, "High": 2, "Extreme": 3}
    highest_risk = max(risk_levels, key=lambda r: risk_rank[r])
    avg_ffwi = round(
        sum(f.get("ffwi_score", 0) for f in _session_hazards) / len(_session_hazards), 2
    )

    return {
        "frames_analyzed": len(_session_hazards),
        "highest_risk": highest_risk,
        "average_ffwi": avg_ffwi,
        "hazards": deduped,
    }
