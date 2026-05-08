import os
import math
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

app = FastAPI(title="Wildfire Defensible Space Hazard Detector", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session report store
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
# Issue #2 — Fosberg Fire Weather Index
# ---------------------------------------------------------------------------

def _moisture_content(h: float, T: float) -> float:
    """Equilibrium moisture content from humidity h (%) and temperature T (°F)."""
    if h < 10:
        return 0.03229 + 0.281073 * h - 0.000578 * h * T
    elif h <= 50:
        return 2.22749 + 0.160107 * h - 0.01478 * T
    else:
        return 21.0606 + 0.005565 * h ** 2 - 0.00035 * h * T - 0.483199 * h


def calculate_ffwi(temperature_f: float, humidity_pct: float, wind_mph: float) -> tuple[float, str]:
    """Return (ffwi_score, risk_level)."""
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
# Issue #3 — OpenWeatherMap weather fetch
# ---------------------------------------------------------------------------

async def fetch_weather(lat: float, lon: float) -> dict:
    """Fetch current weather from OpenWeatherMap; return temp_f, humidity_pct, wind_mph."""
    url = (
        f"https://api.openweathermap.org/data/2.5/weather"
        f"?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=imperial"
    )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    return {
        "temperature_f": round(data["main"]["temp"], 1),
        "humidity_pct": data["main"]["humidity"],
        "wind_mph": round(data["wind"]["speed"], 1),
    }


# ---------------------------------------------------------------------------
# Issue #4 — Grok Vision + Gemini fallback hazard detection
# ---------------------------------------------------------------------------

_HAZARD_PROMPT = """You are a CAL FIRE defensible space expert. Analyze the image and identify all wildfire hazards.

Return ONLY a valid JSON array. Each element must have:
- "name": short hazard name
- "location_in_image": where in the frame (e.g. "bottom left", "center", "top right")
- "severity": one of "severe", "moderate", "minor"
- "action": one-sentence removal recommendation

If no hazards detected, return an empty array [].
Example:
[
  {
    "name": "Dead vegetation near structure",
    "location_in_image": "bottom left",
    "severity": "severe",
    "action": "Remove immediately — dry fuel within 30ft of structure"
  }
]"""


def _parse_hazards(text: str) -> list[dict]:
    """Extract JSON array from model response text."""
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []


async def detect_hazards_grok(image_base64: str) -> list[dict]:
    """Use Grok Vision to detect hazards. Raises on failure."""
    client = OpenAI(api_key=XAI_API_KEY, base_url="https://api.x.ai/v1")
    response = client.chat.completions.create(
        model="grok-2-vision-latest",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                    {"type": "text", "text": _HAZARD_PROMPT},
                ],
            }
        ],
        max_tokens=1024,
    )
    return _parse_hazards(response.choices[0].message.content)


async def detect_hazards_gemini(image_base64: str) -> list[dict]:
    """Fallback: use Gemini Vision to detect hazards."""
    import google.generativeai as genai

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-1.5-flash")

    image_bytes = base64.b64decode(image_base64)
    import tempfile, pathlib

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    import PIL.Image

    img = PIL.Image.open(tmp_path)
    response = model.generate_content([_HAZARD_PROMPT, img])
    pathlib.Path(tmp_path).unlink(missing_ok=True)
    return _parse_hazards(response.text)


async def detect_hazards(image_base64: str) -> tuple[list[dict], str]:
    """Try Grok first, fall back to Gemini. Returns (hazards, model_used)."""
    try:
        hazards = await detect_hazards_grok(image_base64)
        log.info("Hazard detection via Grok Vision succeeded")
        return hazards, "grok-2-vision-latest"
    except Exception as exc:
        log.warning("Grok Vision failed (%s), falling back to Gemini", exc)

    hazards = await detect_hazards_gemini(image_base64)
    log.info("Hazard detection via Gemini succeeded")
    return hazards, "gemini-1.5-flash"


# ---------------------------------------------------------------------------
# Issue #5 — Urgency classification
# ---------------------------------------------------------------------------

_URGENCY_MATRIX = {
    # (risk_level, severity) -> urgency label
    ("Extreme", "severe"): "MUST",
    ("Extreme", "moderate"): "MUST",
    ("Extreme", "minor"): "SHOULD",
    ("High", "severe"): "MUST",
    ("High", "moderate"): "SHOULD",
    ("High", "minor"): "COULD",
    ("Moderate", "severe"): "SHOULD",
    ("Moderate", "moderate"): "COULD",
    ("Moderate", "minor"): "COULD",
    ("Low", "severe"): "COULD",
    ("Low", "moderate"): "MAY",
    ("Low", "minor"): "MAY",
}

_URGENCY_ORDER = {"MUST": 0, "SHOULD": 1, "COULD": 2, "MAY": 3}


def classify_hazards(hazards: list[dict], risk_level: str) -> list[dict]:
    classified = []
    for h in hazards:
        severity = h.get("severity", "minor")
        urgency = _URGENCY_MATRIX.get((risk_level, severity), "MAY")
        classified.append({
            "name": h.get("name", "Unknown hazard"),
            "location_in_image": h.get("location_in_image", "unknown"),
            "urgency": urgency,
            "action": h.get("action", "Evaluate and remove if necessary"),
        })
    classified.sort(key=lambda x: _URGENCY_ORDER[x["urgency"]])
    return classified


def overall_score(risk_level: str, hazards: list[dict]) -> int:
    """1-5 composite risk score."""
    base = {"Low": 1, "Moderate": 2, "High": 3, "Extreme": 4}[risk_level]
    must_count = sum(1 for h in hazards if h["urgency"] == "MUST")
    return min(5, base + (1 if must_count > 0 else 0))


# ---------------------------------------------------------------------------
# Terminal pretty-print helper
# ---------------------------------------------------------------------------

_RISK_COLORS = {
    "Low": "\033[92m",       # green
    "Moderate": "\033[93m",  # yellow
    "High": "\033[91m",      # red
    "Extreme": "\033[95m",   # magenta
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
# Issue #6 — API endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    # 1. Fetch weather
    try:
        weather = await fetch_weather(req.lat, req.lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather fetch failed: {exc}")

    # 2. FFWI
    ffwi_score, risk_level = calculate_ffwi(
        weather["temperature_f"], weather["humidity_pct"], weather["wind_mph"]
    )

    # 3. Vision hazard detection
    try:
        raw_hazards, model_used = await detect_hazards(req.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision analysis failed: {exc}")

    # 4. Classify + score
    hazards = classify_hazards(raw_hazards, risk_level)
    score = overall_score(risk_level, hazards)

    result = {
        "ffwi_score": ffwi_score,
        "risk_level": risk_level,
        "weather": weather,
        "hazards": hazards,
        "overall_score": score,
        "model_used": model_used,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    print_analysis(result)
    return result


@app.post("/report/add")
async def report_add(req: ReportAddRequest):
    _session_hazards.append(req.analysis)
    return {"status": "added", "total_frames": len(_session_hazards)}


@app.get("/report/summary")
async def report_summary():
    if not _session_hazards:
        return {"frames_analyzed": 0, "hazards": [], "highest_risk": None}

    # Deduplicate hazards by name, keeping highest urgency
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
