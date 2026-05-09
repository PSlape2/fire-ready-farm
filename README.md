# FireReadyFarm — Wildfire Risk Assessment

Real-time wildfire hazard detection and property risk assessment, built for the 2026 DataHacks Hackathon.

## What is this

FireReadyFarm offers two modes of wildfire risk analysis:
- **Quick Assessment** — fill out a short form, optionally upload a photo, and get a property risk report with an action checklist
- **Live Deep Scan** — point your phone camera at your surroundings for real-time AI hazard detection, live weather data, and a Fosberg Fire Weather Index (FFWI) score

## Tech Stack

- **Backend**: FastAPI, Groq LLaMA Vision (meta-llama/llama-4-scout-17b-16e-instruct), OpenWeatherMap API
- **Frontend**: Next.js 15, Tailwind CSS
- **Mobile access**: ngrok

## API Keys Required

| Key | Purpose | Free sign-up |
|-----|---------|--------------|
| `GROQ_API_KEY` | LLaMA Vision hazard detection in the FastAPI backend | [console.groq.com](https://console.groq.com/keys) |
| ngrok authtoken | Expose local server to your phone over HTTPS (not in .env — see step 4) | [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken) |

> **No key needed:** Open-Meteo (frontend weather route) and the local BLIP/CLIP vision models (frontend image analysis) are fully free with no account required.

## Setup

**1. Clone and switch to the right branch**
```
git clone https://github.com/raw012/WildFireDangerChecker.git
cd WildFireDangerChecker
git checkout main
```

**2. Set up Python backend**
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
Fill in all API keys in `.env`

**3. Install frontend dependencies**
```
npm install
```

**4. Run (3 terminals)**

Terminal 1 — Backend:
```
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

Terminal 2 — Frontend:
```
npm run dev
```

Terminal 3 — Mobile access (optional):
```
ngrok config add-authtoken <your_ngrok_authtoken>
ngrok http 3000
```
Open the `https://xxxx.ngrok-free.app` URL on your phone.

## Using on Mobile

Open the ngrok URL in Safari on your iPhone. Landscape mode recommended for the Live Deep Scan interface. Tap **Live Deep Scan**, allow camera access, and point your phone at the area you want to assess. Results update automatically every 8 seconds.

## FFWI Formula

The Fosberg Fire Weather Index measures fire weather risk from temperature, humidity, and wind:

```
For h < 10%:       m = 0.03229 + 0.281073h − 0.000578hT
For 10% < h ≤ 50%: m = 2.22749 + 0.160107h − 0.01478T
For h > 50%:       m = 21.0606 + 0.005565h² − 0.00035hT − 0.483199h
n    = 1 − 2(m/30) + 1.5(m/30)² − 0.5(m/30)³
FFWI = n × √(1 + U²) / 0.3002
```

FFWI < 10 = Low · 10–25 = Moderate · 25–50 = High · > 50 = Extreme
