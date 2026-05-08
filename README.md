# Wildfire Defensible Space Hazard Detector

Real-time wildfire hazard detection system using computer vision and weather data.
Analyzes camera frames against CAL FIRE defensible space standards and calculates the Fosberg Fire Weather Index (FFWI).

## Architecture

```
Browser (test.html)
  │  base64 frame + GPS every 3s
  ▼
FastAPI Backend (main.py)
  ├─ OpenWeatherMap API  →  temperature, humidity, wind
  ├─ FFWI calculator     →  fire weather risk score
  ├─ Grok Vision         →  hazard detection (primary)
  │    └─ Gemini Vision  →  fallback if Grok fails
  └─ Urgency classifier  →  MUST / SHOULD / COULD / MAY
```

## Prerequisites

- Python 3.11+
- API keys for OpenWeatherMap, xAI (Grok), and Google Gemini

## Setup

```bash
# 1. Clone and enter the project
git clone https://github.com/raw012/WildFireDangerChecker.git
cd WildFireDangerChecker

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure API keys
cp .env.example .env
# Edit .env and fill in your keys:
#   XAI_API_KEY          — https://console.x.ai/
#   OPENWEATHER_API_KEY  — https://home.openweathermap.org/api_keys
#   GEMINI_API_KEY       — https://aistudio.google.com/app/apikey

# 5. Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 6. Open the test UI
open test.html   # or double-click in Finder
```

## API Endpoints

### `POST /analyze`

Analyze a single camera frame.

**Request body:**
```json
{
  "image_base64": "<base64-encoded JPEG>",
  "lat": 32.8801,
  "lon": -117.2340,
  "language": "en"
}
```

**Response:**
```json
{
  "ffwi_score": 34.2,
  "risk_level": "High",
  "weather": {
    "temperature_f": 85,
    "humidity_pct": 22,
    "wind_mph": 15
  },
  "hazards": [
    {
      "name": "Dead vegetation near structure",
      "location_in_image": "bottom left",
      "urgency": "MUST",
      "action": "Remove immediately — dry fuel within 30ft of structure"
    }
  ],
  "overall_score": 4,
  "model_used": "grok-2-vision-latest",
  "timestamp": "2026-05-07T20:00:00Z"
}
```

**Risk levels:**

| FFWI Range | Risk Level |
|------------|------------|
| < 10       | Low        |
| 10 – 25    | Moderate   |
| 25 – 50    | High       |
| > 50       | Extreme    |

**Urgency matrix:**

| FFWI Risk + Hazard Severity | Urgency |
|-----------------------------|---------|
| Extreme/High + severe       | MUST    |
| High/Moderate + moderate    | SHOULD  |
| Moderate + minor            | COULD   |
| Low + minor                 | MAY     |

---

### `POST /report/add`

Add a completed analysis frame to the session report.

**Request body:**
```json
{ "analysis": { /* full /analyze response */ } }
```

---

### `GET /report/summary`

Returns the deduplicated, prioritized session summary across all analyzed frames.

**Response:**
```json
{
  "frames_analyzed": 12,
  "highest_risk": "High",
  "average_ffwi": 31.4,
  "hazards": [
    {
      "name": "Dead vegetation near structure",
      "urgency": "MUST",
      ...
    }
  ]
}
```

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-05-07T20:00:00Z" }
```

## Fosberg Fire Weather Index Formula

```
For h < 10%:       m = 0.03229 + 0.281073h - 0.000578hT
For 10% < h ≤ 50%: m = 2.22749 + 0.160107h - 0.01478T
For h > 50%:       m = 21.0606 + 0.005565h² - 0.00035hT - 0.483199h

n    = 1 - 2(m/30) + 1.5(m/30)² - 0.5(m/30)³
FFWI = n × √(1 + U²) / 0.3002

where T = temperature (°F), h = relative humidity (%), U = wind speed (mph)
```

## Vision Model Fallback

1. **Primary:** Grok Vision (`grok-2-vision-latest`) via xAI API
2. **Fallback:** Gemini Vision (`gemini-1.5-flash`) — activated automatically if Grok fails

## License

MIT
