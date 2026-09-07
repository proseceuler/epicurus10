/** OpenWeatherMap current weather (optional API key). */

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

export function getWeatherKey() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(OW_KEY) || '';
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

export async function fetchWeather(): Promise<WeatherSnapshot | null> {
  const apiKey = getWeatherKey();
  const city = getWeatherCity();
  if (!apiKey) return null;

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const cached = JSON.parse(raw) as WeatherSnapshot;
      if (cached.city === city && Date.now() - cached.updatedAt < 20 * 60_000) return cached;
    }
  } catch {
    /* ignore */
  }

  const url =
    'https://api.openweathermap.org/data/2.5/weather?q=' +
    encodeURIComponent(city) +
    '&appid=' +
    encodeURIComponent(apiKey) +
    '&units=metric';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  const snap: WeatherSnapshot = {
    tempC: Math.round(data.main?.temp ?? 0),
    description: String(data.weather?.[0]?.description || '—'),
    icon: String(data.weather?.[0]?.icon || ''),
    city: data.name || city,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
  return snap;
}
