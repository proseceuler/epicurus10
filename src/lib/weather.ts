export type WeatherSnapshot = {
  tempC: number;
  description: string;
  icon: string;
  city: string;
  updatedAt: number;
};

const KEY = 'epicure:weather:cache';
const CITY_KEY = 'epicure:weather:city';
export const OW_KEY = 'epicure:openweather-key';

const WMO: Record<number, string> = {
  0: 'clear',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'rime fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  80: 'rain showers',
  81: 'rain showers',
  82: 'violent showers',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'thunderstorm',
};

export function getWeatherKey() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(OW_KEY) || import.meta.env.VITE_OPENWEATHER_API_KEY || '';
}

export function setWeatherKey(v: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OW_KEY, v.trim());
}

export function getWeatherCity() {
  if (typeof window === 'undefined') return 'Manila';
  return localStorage.getItem(CITY_KEY) || 'Manila';
}

export function setWeatherCity(v: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CITY_KEY, v.trim() || 'Manila');
}

function readCache(city: string): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as WeatherSnapshot;
    if (cached.city.toLowerCase() === city.toLowerCase() && Date.now() - cached.updatedAt < 20 * 60_000) {
      return cached;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(snap: WeatherSnapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

async function fromOpenWeather(city: string, apiKey: string): Promise<WeatherSnapshot> {
  const url =
    'https://api.openweathermap.org/data/2.5/weather?q=' +
    encodeURIComponent(city) +
    '&appid=' +
    encodeURIComponent(apiKey) +
    '&units=metric';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  return {
    tempC: Math.round(data.main?.temp ?? 0),
    description: String(data.weather?.[0]?.description || '—'),
    icon: String(data.weather?.[0]?.icon || ''),
    city: data.name || city,
    updatedAt: Date.now(),
  };
}

async function fromOpenMeteo(city: string): Promise<WeatherSnapshot> {
  const geoRes = await fetch(
    'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
      encodeURIComponent(city),
  );
  if (!geoRes.ok) throw new Error('Geocode failed');
  const geo = await geoRes.json();
  const hit = geo.results?.[0];
  if (!hit) throw new Error('City not found');
  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code`,
  );
  if (!wxRes.ok) throw new Error('Forecast failed');
  const wx = await wxRes.json();
  const code = Number(wx.current?.weather_code ?? 0);
  return {
    tempC: Math.round(wx.current?.temperature_2m ?? 0),
    description: WMO[code] || 'fair',
    icon: String(code),
    city: hit.name || city,
    updatedAt: Date.now(),
  };
}

export async function fetchWeather(): Promise<WeatherSnapshot | null> {
  const city = getWeatherCity();
  const cached = readCache(city);
  if (cached) return cached;

  const apiKey = getWeatherKey();
  try {
    const snap = apiKey ? await fromOpenWeather(city, apiKey) : await fromOpenMeteo(city);
    writeCache(snap);
    return snap;
  } catch {
    if (apiKey) {
      try {
        const snap = await fromOpenMeteo(city);
        writeCache(snap);
        return snap;
      } catch {
        return null;
      }
    }
    return null;
  }
}
