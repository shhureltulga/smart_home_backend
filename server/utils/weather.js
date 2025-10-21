// server/utils/weather.js  (Node 18+: fetch глобал)
const DEFAULT_TIMEOUT_MS = 8000; // 8s

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Open-Meteo current weather (key шаардахгүй).
 * @returns {Promise<{tempC:number|null, humidity:number|null, windSpeedMs:number|null, rainMm:number|null} | null>}
 */
export async function fetchWeatherNow(lat, lon) {
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    // ⚠️ current-д precipitation_probability биш, precipitation ашиглана
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation'
    );
    url.searchParams.set('windspeed_unit', 'ms');       // м/с
    url.searchParams.set('timezone', 'Asia/Ulaanbaatar');

    const res = await fetch(url.toString(), { signal: ctl.signal });
    if (!res.ok) {
      console.error('[weather] bad status:', res.status);
      return null;
    }

    const j = await res.json();
    const c = j?.current;
    if (!c) {
      console.warn('[weather] no current block in response');
      return null;
    }

    return {
      tempC:       toNum(c.temperature_2m),
      humidity:    toNum(c.relative_humidity_2m),
      windSpeedMs: toNum(c.wind_speed_10m),
      // current-д бол “precipitation” (мм). Хэрэв та probability хэрэгтэй бол hourly-г тусад нь хүс.
      rainMm:      toNum(c.precipitation)
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.error('[weather] fetch timeout');
    } else {
      console.error('[weather] fetchWeatherNow error:', e);
    }
    return null;
  } finally {
    clearTimeout(tid);
  }
}

