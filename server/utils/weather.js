// Node 18+ : fetch нь глобал тул import хэрэггүй

/**
 * Open-Meteo — key шаардлагагүй.
 * @returns {Promise<{tempC:number, humidity:number, windSpeedMs:number, rainProb:number} | null>}
 */
export async function fetchWeatherNow(lat, lon) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m'
    );
    url.searchParams.set('timezone', 'Asia/Ulaanbaatar');

    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;

    const j = await res.json();
    const c = j?.current ?? {};
    const p = Number.isFinite(c?.precipitation_probability)
      ? Number(c.precipitation_probability)
      : 0;

    return {
      tempC: Number(c.temperature_2m ?? NaN),
      humidity: Number(c.relative_humidity_2m ?? NaN),
      windSpeedMs: Number(c.wind_speed_10m ?? NaN),
      rainProb: p,
    };
  } catch (e) {
    if (e?.name === 'AbortError') {
      console.error('[weather] fetch timeout');
    } else {
      console.error('[weather] fetchWeatherNow error:', e);
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}
