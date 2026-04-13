/**
 * Weather MCP Server
 * ──────────────────
 * Uses Open-Meteo (free, no API key) for real-time weather + 5-day forecast.
 * Covers temperature, feels-like, humidity, wind, UV, rain probability,
 * precipitation, and weather condition description for any city worldwide.
 *
 * Start : node server.js
 * Port  : 3006
 * Register in AgentOven endpoint: http://host.docker.internal:3006/mcp
 */

const http = require('http');
const PORT = 3006;

// ── WMO Weather Interpretation Codes → human-readable description ─────────────
const WMO = {
  0:  'Clear sky',
  1:  'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy',        48: 'Depositing rime fog',
  51: 'Light drizzle',53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Slight rain',  63: 'Moderate rain',   65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};
const wmoDesc  = code => WMO[code] ?? `Code ${code}`;
const rainRisk = prob => prob >= 70 ? '🌧 High'   : prob >= 40 ? '🌦 Moderate' : '☀️ Low';
const uvRisk   = uv   => uv >= 8   ? '🔴 Very high' : uv >= 6 ? '🟠 High' : uv >= 3 ? '🟡 Moderate' : '🟢 Low';
const windDir  = deg  => {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
};

// ── Tool definition (returned to AgentOven via tools/list) ────────────────────
const WEATHER_TOOL = {
  name: 'Weather',
  description:
    'Get real-time weather conditions AND a 5-day forecast for any city ' +
    'worldwide. Returns temperature (°C/°F), feels-like, humidity, wind, UV index, ' +
    'rain probability, precipitation forecast, climate conditions, and plain-English ' +
    'recommendations. Supports comparison of multiple cities when asked.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'City name to get weather for. Examples: "Bangalore", "London", ' +
          '"New York, US", "Mumbai", "Tokyo". Include country code for disambiguation.',
      },
    },
    required: ['query'],
  },
};

// ── Core weather fetch (Open-Meteo — free, no API key) ────────────────────────
async function getWeather(cityQuery) {
  // 1. Geocode the city
  const geoRes  = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1&language=en&format=json`
  );
  const geoData = await geoRes.json();

  if (!geoData.results?.length) {
    return { error: `City "${cityQuery}" not found. Try a different spelling or add the country code.` };
  }

  const { latitude, longitude, name, country, admin1, timezone } = geoData.results[0];
  const fullLocation = [name, admin1, country].filter(Boolean).join(', ');

  // 2. Fetch current conditions + 5-day daily + hourly precipitation
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: [
      'temperature_2m','apparent_temperature','relative_humidity_2m',
      'precipitation','rain','weather_code',
      'wind_speed_10m','wind_direction_10m','wind_gusts_10m',
      'uv_index','visibility','surface_pressure',
    ].join(','),
    daily: [
      'temperature_2m_max','temperature_2m_min',
      'apparent_temperature_max','apparent_temperature_min',
      'precipitation_sum','precipitation_probability_max',
      'precipitation_hours','rain_sum',
      'weather_code','wind_speed_10m_max','wind_gusts_10m_max',
      'uv_index_max','sunrise','sunset',
    ].join(','),
    hourly: 'precipitation_probability,precipitation,temperature_2m',
    timezone: timezone ?? 'auto',
    forecast_days: '5',
    wind_speed_unit: 'kmh',
  });

  const wRes  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  const w     = await wRes.json();
  const c     = w.current;
  const d     = w.daily;

  // 3. Build current weather block
  const tempF = val => (val * 9 / 5 + 32).toFixed(1);

  const current = {
    location          : fullLocation,
    coordinates       : `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`,
    timezone          : w.timezone,
    condition         : wmoDesc(c.weather_code),
    temperature       : `${c.temperature_2m}°C / ${tempF(c.temperature_2m)}°F`,
    feels_like        : `${c.apparent_temperature}°C / ${tempF(c.apparent_temperature)}°F`,
    humidity          : `${c.relative_humidity_2m}%`,
    wind              : `${c.wind_speed_10m} km/h ${windDir(c.wind_direction_10m)} (gusts ${c.wind_gusts_10m} km/h)`,
    visibility_km     : c.visibility / 1000,
    pressure_hpa      : c.surface_pressure,
    uv_index          : `${c.uv_index} — ${uvRisk(c.uv_index)}`,
    rain_now_mm       : c.rain,
    precipitation_mm  : c.precipitation,
  };

  // 4. Build 5-day forecast
  const forecast = d.time.map((date, i) => ({
    date,
    condition           : wmoDesc(d.weather_code[i]),
    temp_max            : `${d.temperature_2m_max[i]}°C / ${tempF(d.temperature_2m_max[i])}°F`,
    temp_min            : `${d.temperature_2m_min[i]}°C / ${tempF(d.temperature_2m_min[i])}°F`,
    feels_like_max      : `${d.apparent_temperature_max[i]}°C`,
    sunrise             : d.sunrise[i],
    sunset              : d.sunset[i],
    rain_probability    : `${d.precipitation_probability_max[i]}% — ${rainRisk(d.precipitation_probability_max[i])}`,
    precipitation_mm    : d.precipitation_sum[i],
    rain_mm             : d.rain_sum[i],
    rain_hours          : d.precipitation_hours[i],
    max_wind_kmh        : d.wind_speed_10m_max[i],
    max_gusts_kmh       : d.wind_gusts_10m_max[i],
    uv_index_max        : `${d.uv_index_max[i]} — ${uvRisk(d.uv_index_max[i])}`,
  }));

  // 5. Climate summary & travel tips
  const avgRainProb = Math.round(
    d.precipitation_probability_max.reduce((a, b) => a + b, 0) / d.time.length
  );
  const tips = [];
  if (avgRainProb >= 60) tips.push('🌂 Carry an umbrella — significant rain expected over the next 5 days.');
  if (c.uv_index >= 6)   tips.push('🕶 High UV — wear sunscreen and sunglasses.');
  if (c.apparent_temperature > 35) tips.push('🥵 Extreme heat — stay hydrated and avoid midday sun.');
  if (c.apparent_temperature < 5)  tips.push('🧥 Cold conditions — dress in warm layers.');
  if (c.wind_speed_10m > 40)       tips.push('💨 Strong winds — secure loose objects outdoors.');

  return {
    current,
    forecast_5_days    : forecast,
    climate_summary    : {
      avg_rain_probability_pct : avgRainProb,
      rain_risk_outlook        : rainRisk(avgRainProb),
      total_expected_rain_mm   : d.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1),
      recommendations          : tips.length ? tips : ['✅ Pleasant conditions expected.'],
    },
  };
}

// ── MCP HTTP handler ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'Weather MCP', port: PORT }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }

  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', async () => {
    const send = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    try {
      const msg = JSON.parse(body);
      const { method, params, id } = msg;

      if (method === 'initialize') {
        return send({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion : '2024-11-05',
            capabilities    : { tools: {} },
            serverInfo      : { name: 'weather-mcp-server', version: '1.0.0' },
          },
        });
      }

      if (method === 'tools/list') {
        return send({ jsonrpc: '2.0', id, result: { tools: [WEATHER_TOOL] } });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        if (name !== 'Weather') throw new Error(`Unknown tool: ${name}`);

        const query = args.query || args.city || args.location || 'Bangalore';
        console.log(`[Weather] Fetching weather for: ${query}`);
        const data = await getWeather(query);

        return send({
          jsonrpc: '2.0', id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          },
        });
      }

      // Ignore notifications
      if (method?.startsWith('notifications/')) {
        return send({ jsonrpc: '2.0', id: null });
      }

      return send({ jsonrpc: '2.0', id, result: {} });

    } catch (err) {
      console.error('[Weather MCP Error]', err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: err.message },
      }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🌤  Weather MCP Server started');
  console.log(`    Local URL  : http://localhost:${PORT}/mcp`);
  console.log(`    Docker URL : http://host.docker.internal:${PORT}/mcp`);
  console.log('    Register the Docker URL in AgentOven → Tools → Register Tool');
  console.log('');
});
