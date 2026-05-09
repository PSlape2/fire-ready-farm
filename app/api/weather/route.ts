import { NextRequest, NextResponse } from "next/server";

export interface WeatherData {
  temperature: number;       // °F
  relativeHumidity: number;  // %
  windSpeed: number;         // mph
  windDirection: number;     // degrees (0–360)
  windDirectionLabel: string;
  precipitation: number;     // inches (last hour)
  weatherCode: number;
  isDay: boolean;
}

export interface WeatherRiskScore {
  score: number;             // 0–100
  tier: "low" | "moderate" | "high" | "extreme";
  label: string;
  color: string;
  bg: string;
  components: {
    temperatureScore: number;
    humidityScore: number;
    windScore: number;
    precipitationScore: number;
  };
  summary: string;
}

export interface WeatherApiResponse {
  weather: WeatherData;
  risk: WeatherRiskScore;
  fetchedAt: string;
  lat: number;
  lon: number;
}

/** Converts a wind bearing in degrees to a 16-point compass label (e.g. 270 → "W"). */
function degToCompass(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** Converts km/h to mph. Open-Meteo is asked for mph directly; kept for reference. */
function kphToMph(kph: number): number {
  return Math.round(kph * 0.621371);
}

/**
 * Wildfire weather risk scoring based on:
 * - Temperature:   hot + dry = high ignition potential
 * - Humidity:      low RH is the primary fuel-dryness driver
 * - Wind speed:    spreads fire and dries fuels
 * - Precipitation: recent rain significantly reduces risk
 *
 * Weights mirror the NOAA Fire Weather Index methodology.
 */
function computeWeatherRisk(w: WeatherData): WeatherRiskScore {
  // --- Temperature score (0–100) ---
  // Risk rises sharply above 85°F, extreme above 105°F
  let tempScore: number;
  if (w.temperature >= 110) tempScore = 100;
  else if (w.temperature >= 100) tempScore = 85 + (w.temperature - 100) * 1.5;
  else if (w.temperature >= 85)  tempScore = 55 + (w.temperature - 85) * 2;
  else if (w.temperature >= 70)  tempScore = 25 + (w.temperature - 70) * 2;
  else if (w.temperature >= 50)  tempScore = 10 + (w.temperature - 50) * 0.75;
  else tempScore = 0;
  tempScore = Math.min(100, Math.max(0, Math.round(tempScore)));

  // --- Humidity score (0–100) — inverted: low RH = high risk ---
  // Below 15% RH: critical fire conditions
  let humidityScore: number;
  if (w.relativeHumidity <= 10)      humidityScore = 100;
  else if (w.relativeHumidity <= 15) humidityScore = 90 + (15 - w.relativeHumidity) * 2;
  else if (w.relativeHumidity <= 25) humidityScore = 70 + (25 - w.relativeHumidity) * 2;
  else if (w.relativeHumidity <= 40) humidityScore = 40 + (40 - w.relativeHumidity) * 2;
  else if (w.relativeHumidity <= 60) humidityScore = 15 + (60 - w.relativeHumidity) * 1.25;
  else humidityScore = 0;
  humidityScore = Math.min(100, Math.max(0, Math.round(humidityScore)));

  // --- Wind score (0–100) ---
  // Above 25 mph becomes critical for rapid fire spread
  let windScore: number;
  if (w.windSpeed >= 60)      windScore = 100;
  else if (w.windSpeed >= 40) windScore = 80 + (w.windSpeed - 40) * 1;
  else if (w.windSpeed >= 25) windScore = 55 + (w.windSpeed - 25) * (25 / 15);
  else if (w.windSpeed >= 15) windScore = 25 + (w.windSpeed - 15) * 3;
  else if (w.windSpeed >= 5)  windScore = 5 + (w.windSpeed - 5) * 2;
  else windScore = 0;
  windScore = Math.min(100, Math.max(0, Math.round(windScore)));

  // --- Precipitation score (0–100) — inverted: more rain = less risk ---
  // Any precipitation in last hour significantly suppresses fire risk
  let precipitationScore: number;
  if (w.precipitation <= 0)        precipitationScore = 100;
  else if (w.precipitation < 0.02) precipitationScore = 80;   // trace
  else if (w.precipitation < 0.1)  precipitationScore = 50;   // light
  else if (w.precipitation < 0.25) precipitationScore = 20;   // moderate
  else precipitationScore = 0;                                 // heavy rain
  precipitationScore = Math.round(precipitationScore);

  // --- Composite via Equilibrium Moisture Content (EMC) ---
  // EMC models how dry the fuel is given RH and temperature, then scales by wind.
  // Three RH ranges use different Nelson EMC equations to match NFDRS moisture tables.
  let emc: number;
  if(w.relativeHumidity <= 10) emc = 0.03229 + 0.281073*w.relativeHumidity - 0.000578*w.relativeHumidity*w.temperature;
  else if(w.relativeHumidity <= 50) emc = 2.22749 + 0.160107*w.relativeHumidity - 0.01478*w.temperature;
  else emc = 21.0606+ 0.005565*w.relativeHumidity*w.relativeHumidity - 0.00035*w.relativeHumidity*w.temperature - 0.483199*w.relativeHumidity;

  const n = 1.0 - 2.0 * (emc/30.0) + 1.5 * (emc/30.0)**2 - 0.5 * (emc/30.0)**3
  const score = Math.round((n*((1+w.windSpeed**2)**0.5)/0.3002));

  const clampedScore = Math.min(100, Math.max(0, score));

  let tier: WeatherRiskScore["tier"];
  let label: string;
  let color: string;
  let bg: string;
  let summary: string;

  if (clampedScore >= 75) {
    tier = "extreme";
    label = "Extreme Fire Weather";
    color = "#9B1C1C";
    bg = "#FEF2F2";
    summary = "Critical fire weather conditions. Extreme spread potential if ignition occurs. Avoid all open burning.";
  } else if (clampedScore >= 55) {
    tier = "high";
    label = "High Fire Weather Risk";
    color = "#DC2626";
    bg = "#FEF2F2";
    summary = "Elevated fire danger. Dry, windy, or hot conditions significantly increase ignition and spread risk.";
  } else if (clampedScore >= 35) {
    tier = "moderate";
    label = "Moderate Fire Weather Risk";
    color = "#D97706";
    bg = "#FFFBEB";
    summary = "Some fire weather concerns present. Monitor conditions and have suppression resources accessible.";
  } else {
    tier = "low";
    label = "Low Fire Weather Risk";
    color = "#16A34A";
    bg = "#F0FDF4";
    summary = "Current weather conditions are relatively unfavorable for fire spread. Stay weather-aware.";
  }

  return {
    score: clampedScore,
    tier,
    label,
    color,
    bg,
    components: {
      temperatureScore: tempScore,
      humidityScore,
      windScore,
      precipitationScore,
    },
    summary,
  };
}

/**
 * GET /api/weather?lat=&lon=
 * Fetches current conditions from Open-Meteo and returns weather data plus a
 * computed fire-weather risk score. Responses are cached for 15 minutes.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json(
      { error: "Missing or invalid lat/lon parameters" },
      { status: 400 }
    );
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: "Coordinates out of valid range" },
      { status: 400 }
    );
  }

  const openMeteoUrl = new URL("https://api.open-meteo.com/v1/forecast");
  openMeteoUrl.searchParams.set("latitude", lat.toString());
  openMeteoUrl.searchParams.set("longitude", lon.toString());
  openMeteoUrl.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "is_day",
    ].join(",")
  );
  openMeteoUrl.searchParams.set("wind_speed_unit", "mph");
  openMeteoUrl.searchParams.set("temperature_unit", "fahrenheit");
  openMeteoUrl.searchParams.set("precipitation_unit", "inch");
  openMeteoUrl.searchParams.set("timezone", "auto");

  let meteoRes: Response;
  try {
    meteoRes = await fetch(openMeteoUrl.toString(), {
      next: { revalidate: 900 }, // cache 15 min
    });
  } catch (err) {
    console.error("Open-Meteo fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to reach weather service" },
      { status: 502 }
    );
  }

  if (!meteoRes.ok) {
    const body = await meteoRes.text();
    console.error("Open-Meteo error:", meteoRes.status, body);
    return NextResponse.json(
      { error: "Weather service returned an error", detail: body },
      { status: 502 }
    );
  }

  const raw = await meteoRes.json();
  const c = raw.current;

  const weather: WeatherData = {
    temperature:      Math.round(c.temperature_2m),
    relativeHumidity: Math.round(c.relative_humidity_2m),
    windSpeed:        Math.round(c.wind_speed_10m),
    windDirection:    Math.round(c.wind_direction_10m),
    windDirectionLabel: degToCompass(c.wind_direction_10m),
    precipitation:    c.precipitation,
    weatherCode:      c.weather_code,
    isDay:            c.is_day === 1,
  };

  const risk = computeWeatherRisk(weather);

  const response: WeatherApiResponse = {
    weather,
    risk,
    fetchedAt: new Date().toISOString(),
    lat,
    lon,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
