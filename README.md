# Wildfire Defensible Space Hazard Detector

Real-time wildfire hazard detection using Groq LLaMA Vision and live weather data.
Analyzes camera frames against CAL FIRE defensible space standards and calculates
the Fosberg Fire Weather Index (FFWI) to prioritize which hazards to remove first.

---

## How it works

1. Browser sends a camera frame + GPS coordinates every N seconds (adjustable)
2. Backend fetches live weather from OpenWeatherMap (temperature, humidity, wind)
3. FFWI is calculated to determine current fire weather risk
4. Groq LLaMA Vision analyzes the image for CAL FIRE defensible space hazards
5. Each hazard is classified as **MUST / SHOULD / COULD / MAY** remove based on
   risk level × hazard severity

---

## Requirements

- Python 3.11+
- A Groq API key (free at [console.groq.com](https://console.groq.com))
- An OpenWeatherMap API key (free at [openweathermap.org](https://home.openweathermap.org/api_keys))

---

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/raw012/WildFireDangerChecker.git
cd WildFireDangerChecker

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your API keys
cp .env.example .env
# Open .env and fill in GROQ_API_KEY and OPENWEATHER_API_KEY

# 5. Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

On startup, the server automatically runs two checks and prints **PASS / FAIL**
for each:
- OpenWeatherMap live weather fetch (UCSD coordinates)
- Groq API text ping

---

## Test UI

Open `test.html` directly in your browser — no web server needed.

- Requests camera access and captures a frame on the configured interval
- Use the **Interval slider** (5 s – 30 s, default 8 s) in the top bar to adjust
  how often frames are sent without editing any code
- FFWI score and risk level are pinned to the top-right corner at all times
- Weather data is fetched independently so it displays even if vision analysis fails

---

## API Reference

### `POST /analyze`

Analyze a single camera frame.

**Request**
```json
{
  "image_base64": "<base64 JPEG string>",
  "lat": 32.8801,
  "lon": -117.2340
}
```

**Response**
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
  "model_used": "meta-llama/llama-4-scout-17b-16e-instruct",
  "timestamp": "2026-05-08T20:00:00Z"
}
```

---

### `GET /weather?lat=&lon=`

Returns current weather + FFWI for any coordinates without requiring an image.

---

### `POST /report/add`

Add a completed analysis frame to the session report.

```json
{ "analysis": { /* /analyze response */ } }
```

---

### `GET /report/summary`

Deduplicated, prioritized summary across all frames analyzed in this session.

```json
{
  "frames_analyzed": 12,
  "highest_risk": "High",
  "average_ffwi": 31.4,
  "hazards": [ ... ]
}
```

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "..." }
```

---

## FFWI Formula

```
For h < 10%:       m = 0.03229 + 0.281073h − 0.000578hT
For 10% < h ≤ 50%: m = 2.22749 + 0.160107h − 0.01478T
For h > 50%:       m = 21.0606 + 0.005565h² − 0.00035hT − 0.483199h

n    = 1 − 2(m/30) + 1.5(m/30)² − 0.5(m/30)³
FFWI = n × √(1 + U²) / 0.3002

T = temperature (°F)   h = relative humidity (%)   U = wind speed (mph)
```

| FFWI     | Risk Level |
|----------|------------|
| < 10     | Low        |
| 10 – 25  | Moderate   |
| 25 – 50  | High       |
| > 50     | Extreme    |

## Urgency Matrix

| FFWI Risk + Hazard Severity      | Action      |
|----------------------------------|-------------|
| Extreme or High + severe         | MUST remove |
| High or Moderate + moderate      | SHOULD remove |
| Moderate + minor                 | COULD remove |
| Low + any minor                  | MAY consider |
