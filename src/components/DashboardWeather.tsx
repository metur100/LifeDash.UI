import { useEffect, useMemo, useState } from "react";
import { ErrorBar } from "./Ui";

export type CityConfig = {
  id: string;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type HourlyForecast = {
  time: string[];
  temp: number[];
  apparentTemp: number[];
  weatherCode: number[];
  precipitationProb: number[];
  precipitation: number[];
  windSpeed: number[];
};

export type DailyForecast = {
  time: string[];
  weatherCode: number[];
  tempMax: number[];
  tempMin: number[];
  precipitationProbabilityMax: number[];
  sunrise: string[];
  sunset: string[];
};

export type WeatherData = {
  currentTemp: number;
  apparentTemp: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  daily: DailyForecast;
  hourly: HourlyForecast;
};

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
};

const STORAGE_KEY_CITIES = "ld_weather_cities";
const STORAGE_KEY_SELECTED = "ld_weather_selected_city_id";

const DEFAULT_CITIES: CityConfig[] = [
  {
    id: "berlin-de",
    name: "Berlin",
    country: "Deutschland",
    latitude: 52.52,
    longitude: 13.405,
    timezone: "Europe/Berlin",
  },
  {
    id: "sarajevo-ba",
    name: "Sarajevo",
    country: "Bosnien und Herzegowina",
    latitude: 43.8563,
    longitude: 18.4131,
    timezone: "Europe/Sarajevo",
  },
  {
    id: "new-york-us",
    name: "New York",
    country: "Vereinigte Staaten",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York",
  },
  {
    id: "tokyo-jp",
    name: "Tokio",
    country: "Japan",
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: "Asia/Tokyo",
  },
];

export function getWeatherDescription(code: number): { text: string; icon: string } {
  switch (code) {
    case 0:
      return { text: "Klar", icon: "fa-sun" };
    case 1:
      return { text: "Meist sonnig", icon: "fa-cloud-sun" };
    case 2:
      return { text: "Teilweise bewölkt", icon: "fa-cloud-sun" };
    case 3:
      return { text: "Bedeckt", icon: "fa-cloud" };
    case 45:
    case 48:
      return { text: "Nebel", icon: "fa-smog" };
    case 51:
    case 53:
    case 55:
      return { text: "Nieselregen", icon: "fa-cloud-rain" };
    case 61:
    case 63:
      return { text: "Regen", icon: "fa-cloud-showers-heavy" };
    case 65:
      return { text: "Starker Regen", icon: "fa-cloud-showers-water" };
    case 71:
    case 73:
    case 75:
      return { text: "Schneefall", icon: "fa-snowflake" };
    case 77:
      return { text: "Schneegriesel", icon: "fa-snowflake" };
    case 80:
    case 81:
    case 82:
      return { text: "Regenschauer", icon: "fa-cloud-rain" };
    case 85:
    case 86:
      return { text: "Schneeschauer", icon: "fa-snowflake" };
    case 95:
      return { text: "Gewitter", icon: "fa-bolt" };
    case 96:
    case 99:
      return { text: "Gewitter mit Hagel", icon: "fa-cloud-bolt" };
    default:
      return { text: "Wolkig", icon: "fa-cloud" };
  }
}

export default function DashboardWeather() {
  const [cities, setCities] = useState<CityConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CITIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CITIES;
  });

  const [selectedCityId, setSelectedCityId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SELECTED);
    if (saved && cities.some((c) => c.id === saved)) return saved;
    return cities[0]?.id || DEFAULT_CITIES[0].id;
  });

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [isManaging, setIsManaging] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [showAll24Hours, setShowAll24Hours] = useState<boolean>(false);

  // Search/Add states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Keep clocks updated every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Save cities to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CITIES, JSON.stringify(cities));
  }, [cities]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SELECTED, selectedCityId);
  }, [selectedCityId]);

  const activeCity = useMemo(() => {
    return cities.find((c) => c.id === selectedCityId) || cities[0];
  }, [cities, selectedCityId]);

  // Load weather when activeCity changes
  useEffect(() => {
    if (!activeCity) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedDayIndex(0);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeCity.latitude}&longitude=${activeCity.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=${encodeURIComponent(
      activeCity.timezone || "auto"
    )}&forecast_days=7`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Wetterdaten konnten nicht geladen werden.");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setWeather({
          currentTemp: Math.round(data.current?.temperature_2m ?? 0),
          apparentTemp: Math.round(data.current?.apparent_temperature ?? 0),
          weatherCode: data.current?.weather_code ?? 0,
          windSpeed: Math.round(data.current?.wind_speed_10m ?? 0),
          humidity: Math.round(data.current?.relative_humidity_2m ?? 0),
          daily: {
            time: data.daily?.time ?? [],
            weatherCode: data.daily?.weather_code ?? [],
            tempMax: (data.daily?.temperature_2m_max ?? []).map(Math.round),
            tempMin: (data.daily?.temperature_2m_min ?? []).map(Math.round),
            precipitationProbabilityMax:
              data.daily?.precipitation_probability_max ?? [],
            sunrise: data.daily?.sunrise ?? [],
            sunset: data.daily?.sunset ?? [],
          },
          hourly: {
            time: data.hourly?.time ?? [],
            temp: (data.hourly?.temperature_2m ?? []).map(Math.round),
            apparentTemp: (data.hourly?.apparent_temperature ?? []).map(Math.round),
            weatherCode: data.hourly?.weather_code ?? [],
            precipitationProb: data.hourly?.precipitation_probability ?? [],
            precipitation: data.hourly?.precipitation ?? [],
            windSpeed: (data.hourly?.wind_speed_10m ?? []).map(Math.round),
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCity?.id, activeCity?.latitude, activeCity?.longitude, activeCity?.timezone]);

  function getCityTime(timeZone?: string) {
    try {
      return new Intl.DateTimeFormat("de-DE", {
        timeZone: timeZone || "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      }).format(now);
    } catch {
      return "--:--";
    }
  }

  function getCityDate(timeZone?: string) {
    try {
      return new Intl.DateTimeFormat("de-DE", {
        timeZone: timeZone || "Europe/Berlin",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(now);
    } catch {
      return "";
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          q
        )}&count=5&language=de&format=json`
      );
      if (!res.ok) throw new Error("Suche fehlgeschlagen.");
      const data = await res.json();
      if (!data.results || data.results.length === 0) {
        setSearchError("Keine passenden Städte gefunden.");
      } else {
        setSearchResults(data.results);
      }
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function addCity(result: GeocodingResult) {
    const newCity: CityConfig = {
      id: `${result.name.toLowerCase().replace(/\s+/g, "-")}-${result.id}`,
      name: result.name,
      country: result.country,
      admin1: result.admin1,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone || "auto",
    };

    if (cities.some((c) => c.latitude === result.latitude && c.longitude === result.longitude)) {
      setSearchError("Diese Stadt ist bereits in der Liste.");
      return;
    }

    const next = [...cities, newCity];
    setCities(next);
    setSelectedCityId(newCity.id);
    setSearchQuery("");
    setSearchResults([]);
    setIsManaging(false);
  }

  function removeCity(id: string) {
    if (cities.length <= 1) return;
    const next = cities.filter((c) => c.id !== id);
    setCities(next);
    if (selectedCityId === id) {
      setSelectedCityId(next[0].id);
    }
  }

  function moveCity(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cities.length) return;
    const next = [...cities];
    const item = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = item;
    setCities(next);
  }

  // Calculate hourly slices for selected day
  const selectedDayHourly = useMemo(() => {
    if (!weather || !weather.daily.time[selectedDayIndex]) return [];
    const targetDateStr = weather.daily.time[selectedDayIndex];

    const items: Array<{
      timeStr: string;
      hourNum: number;
      hourLabel: string;
      temp: number;
      apparentTemp: number;
      weatherCode: number;
      precipitationProb: number;
      precipitation: number;
      windSpeed: number;
      isCurrentHour: boolean;
    }> = [];

    const cityHourNow = parseInt(getCityTime(activeCity?.timezone).split(":")[0], 10);

    weather.hourly.time.forEach((isoTime, index) => {
      if (isoTime.startsWith(targetDateStr)) {
        const timePart = isoTime.includes("T") ? isoTime.split("T")[1] : isoTime.slice(11);
        const hour = parseInt(timePart.slice(0, 2), 10);
        const isCurrentHour = selectedDayIndex === 0 && hour === cityHourNow;

        items.push({
          timeStr: isoTime,
          hourNum: hour,
          hourLabel: `${String(hour).padStart(2, "0")}:00`,
          temp: weather.hourly.temp[index] ?? 0,
          apparentTemp: weather.hourly.apparentTemp[index] ?? 0,
          weatherCode: weather.hourly.weatherCode[index] ?? 0,
          precipitationProb: weather.hourly.precipitationProb[index] ?? 0,
          precipitation: weather.hourly.precipitation[index] ?? 0,
          windSpeed: weather.hourly.windSpeed[index] ?? 0,
          isCurrentHour,
        });
      }
    });

    return items;
  }, [weather, selectedDayIndex, activeCity?.timezone, now]);

  // Filter 8 key intervals (every 3 hours: 0, 3, 6, 9, 12, 15, 18, 21)
  const keyHourlyItems = useMemo(() => {
    return selectedDayHourly.filter((item) => item.hourNum % 3 === 0);
  }, [selectedDayHourly]);

  const displayedHourlyItems = showAll24Hours ? selectedDayHourly : keyHourlyItems;

  const currentCondition = weather
    ? getWeatherDescription(weather.weatherCode)
    : { text: "", icon: "fa-cloud" };

  const selectedDateFormatted = useMemo(() => {
    if (!weather?.daily.time[selectedDayIndex]) return "";
    const dateStr = weather.daily.time[selectedDayIndex];
    const d = new Date(dateStr);
    if (selectedDayIndex === 0) {
      return "Heute (" + new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "short" }).format(d) + ")";
    }
    return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "short" }).format(d);
  }, [weather?.daily.time, selectedDayIndex]);

  // Overall min/max for temperature bar visualization in 7-day forecast
  const overallMinMax = useMemo(() => {
    if (!weather?.daily.tempMin.length) return { min: 0, max: 30 };
    const min = Math.min(...weather.daily.tempMin);
    const max = Math.max(...weather.daily.tempMax);
    return { min, max: Math.max(max, min + 1) };
  }, [weather?.daily]);

  return (
    <div className="weather-widget">
      {/* City Switcher Bar */}
      <div className="weather-header">
        <div className="weather-selector-wrap">
          <label htmlFor="weather-city-select" className="weather-select-label">
            <i className="fa-solid fa-location-dot" aria-hidden />
          </label>
          <select
            id="weather-city-select"
            className="weather-city-select"
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
          >
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} — {getCityTime(city.timezone)} Uhr
              </option>
            ))}
          </select>
        </div>

        <div className="weather-actions">
          <button
            type="button"
            className={`btn small ghost ${isManaging ? "active" : ""}`}
            onClick={() => setIsManaging(!isManaging)}
            title="Städte bearbeiten & neue hinzufügen"
            aria-label="Städte bearbeiten"
          >
            <i className="fa-solid fa-gear" aria-hidden />{" "}
            <span>{isManaging ? "Schließen" : "Städte"}</span>
          </button>
        </div>
      </div>

      {/* City Search & Management Drawer */}
      {isManaging && (
        <div className="weather-management-panel">
          <div className="management-head">
            <h4>Städte verwalten &amp; Neue Stadt hinzufügen</h4>
          </div>

          <form className="weather-search-form" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Stadt suchen (z. B. München, London, Wien)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="btn small" type="submit" disabled={searching}>
              {searching ? "Sucht..." : "Suchen"}
            </button>
          </form>

          {searchError && <p className="error-text small">{searchError}</p>}

          {searchResults.length > 0 && (
            <div className="weather-search-results">
              {searchResults.map((res) => (
                <div key={res.id} className="search-result-item">
                  <div className="search-result-text">
                    <strong>{res.name}</strong>
                    <span className="search-result-sub">
                      {[res.admin1, res.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => addCity(res)}
                  >
                    + Hinzufügen
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="weather-city-list">
            <h5>Aktive Städte ({cities.length})</h5>
            {cities.map((city, idx) => (
              <div key={city.id} className="city-manage-item">
                <div className="city-manage-info">
                  <strong>{city.name}</strong>
                  <span>{city.country || city.timezone}</span>
                </div>
                <div className="city-manage-controls">
                  <button
                    type="button"
                    className="btn-icon"
                    disabled={idx === 0}
                    onClick={() => moveCity(idx, "up")}
                    title="Nach oben"
                    aria-label="Nach oben"
                  >
                    <i className="fa-solid fa-arrow-up" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    disabled={idx === cities.length - 1}
                    onClick={() => moveCity(idx, "down")}
                    title="Nach unten"
                    aria-label="Nach unten"
                  >
                    <i className="fa-solid fa-arrow-down" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger"
                    disabled={cities.length <= 1}
                    onClick={() => removeCity(city.id)}
                    title="Stadt entfernen"
                    aria-label="Stadt entfernen"
                  >
                    <i className="fa-solid fa-trash" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <ErrorBar message={error} />}

      {activeCity && (
        <div className="weather-card">
          {/* Main Hero Header */}
          <div className="weather-hero-block">
            <div className="weather-city-details">
              <div className="city-title-row">
                <h3 className="city-name">{activeCity.name}</h3>
                <span className="city-sub">
                  {[activeCity.admin1, activeCity.country].filter(Boolean).join(", ")}
                </span>
              </div>
              <div className="city-time-badge">
                <i className="fa-regular fa-clock" aria-hidden />
                <span>{getCityDate(activeCity.timezone)}, <strong>{getCityTime(activeCity.timezone)} Uhr</strong></span>
              </div>
            </div>

            {loading ? (
              <div className="weather-loading">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Wetterdaten laden...
              </div>
            ) : weather ? (
              <div className="weather-hero-main">
                <div className="current-temp-icon">
                  <i className={`fa-solid ${currentCondition.icon} weather-hero-icon`} aria-hidden />
                  <div className="temp-values">
                    <span className="temp-number">{weather.currentTemp}°</span>
                    <span className="temp-condition">{currentCondition.text}</span>
                  </div>
                </div>

                {weather.daily.tempMax[0] !== undefined && weather.daily.tempMin[0] !== undefined && (
                  <div className="today-range-pill">
                    <span>H: <strong>{weather.daily.tempMax[0]}°</strong></span>
                    <span>T: <strong>{weather.daily.tempMin[0]}°</strong></span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* 4 Stat Pills */}
          {weather && !loading && (
            <div className="weather-metrics-bar">
              <div className="metric-pill">
                <i className="fa-solid fa-temperature-half metric-icon" aria-hidden />
                <div className="metric-data">
                  <span className="metric-label">Gefühlt</span>
                  <span className="metric-val">{weather.apparentTemp}°</span>
                </div>
              </div>
              <div className="metric-pill">
                <i className="fa-solid fa-cloud-rain metric-icon" aria-hidden />
                <div className="metric-data">
                  <span className="metric-label">Regenrisiko</span>
                  <span className="metric-val">
                    {weather.daily.precipitationProbabilityMax[0] ?? 0}%
                  </span>
                </div>
              </div>
              <div className="metric-pill">
                <i className="fa-solid fa-wind metric-icon" aria-hidden />
                <div className="metric-data">
                  <span className="metric-label">Wind</span>
                  <span className="metric-val">{weather.windSpeed} <small>km/h</small></span>
                </div>
              </div>
              <div className="metric-pill">
                <i className="fa-solid fa-droplet metric-icon" aria-hidden />
                <div className="metric-data">
                  <span className="metric-label">Feuchtigkeit</span>
                  <span className="metric-val">{weather.humidity}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Hourly Timeline - Responsive Grid Fitting 100% On Screen */}
          {weather && selectedDayHourly.length > 0 && (
            <div className="hourly-section">
              <div className="hourly-section-head">
                <div className="hourly-title-group">
                  <i className="fa-solid fa-clock-rotate-left" aria-hidden />
                  <span className="hourly-title">
                    Stundenticker: <strong>{selectedDateFormatted}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-text-toggle"
                  onClick={() => setShowAll24Hours(!showAll24Hours)}
                >
                  {showAll24Hours ? "3-Std.-Raster" : "Alle 24 Std."}
                </button>
              </div>

              <div className={`hourly-fit-grid ${showAll24Hours ? "full-hours" : "key-hours"}`}>
                {displayedHourlyItems.map((hourItem) => {
                  const hCond = getWeatherDescription(hourItem.weatherCode);
                  return (
                    <div
                      key={hourItem.timeStr}
                      className={`hourly-cell ${hourItem.isCurrentHour ? "current-hour" : ""}`}
                    >
                      <span className="cell-time">{hourItem.hourLabel}</span>
                      <i
                        className={`fa-solid ${hCond.icon} cell-icon`}
                        title={hCond.text}
                        aria-hidden
                      />
                      <span className="cell-temp">{hourItem.temp}°</span>
                      <div className="cell-rain-block">
                        {hourItem.precipitationProb > 0 ? (
                          <span className="cell-rain-prob" title="Regen">
                            <i className="fa-solid fa-droplet" aria-hidden /> {hourItem.precipitationProb}%
                          </span>
                        ) : (
                          <span className="cell-rain-empty">-</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7-Day Forecast - Clean Responsive Vertical List Fitting 100% Width */}
          {weather && weather.daily.time.length > 0 && (
            <div className="weather-forecast-section">
              <div className="forecast-header-row">
                <h4 className="forecast-title">7-Tage-Vorhersage</h4>
                <span className="forecast-hint">Tag antippen für Stundenticker</span>
              </div>

              <div className="forecast-list" role="tablist" aria-label="Tagesauswahl">
                {weather.daily.time.slice(0, 7).map((dateStr, index) => {
                  const d = new Date(dateStr);
                  const weekday = index === 0 ? "Heute" : new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d);
                  const dayDate = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "numeric" }).format(d);
                  const cond = getWeatherDescription(weather.daily.weatherCode[index]);
                  const rain = weather.daily.precipitationProbabilityMax[index];
                  const isSelected = selectedDayIndex === index;

                  const minTemp = weather.daily.tempMin[index];
                  const maxTemp = weather.daily.tempMax[index];

                  // Bar calculation for relative visualization
                  const range = overallMinMax.max - overallMinMax.min;
                  const leftPercent = Math.max(0, Math.round(((minTemp - overallMinMax.min) / range) * 100));
                  const widthPercent = Math.max(10, Math.round(((maxTemp - minTemp) / range) * 100));

                  return (
                    <button
                      type="button"
                      key={dateStr}
                      className={`forecast-row-card ${isSelected ? "selected" : ""} ${index === 0 ? "today" : ""}`}
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setSelectedDayIndex(index)}
                    >
                      <div className="row-day-meta">
                        <span className="row-day-name">{weekday}</span>
                        <span className="row-day-date">{dayDate}</span>
                      </div>

                      <div className="row-condition">
                        <i className={`fa-solid ${cond.icon} row-icon`} aria-hidden />
                        <span className="row-condition-text">{cond.text}</span>
                      </div>

                      <div className="row-rain-cell">
                        {rain !== undefined && rain > 0 ? (
                          <span className="row-rain-badge">
                            <i className="fa-solid fa-droplet" aria-hidden /> {rain}%
                          </span>
                        ) : null}
                      </div>

                      <div className="row-temp-bar-wrap">
                        <span className="row-min-temp">{minTemp}°</span>
                        <div className="row-temp-bar-track">
                          <div
                            className="row-temp-bar-fill"
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                          />
                        </div>
                        <span className="row-max-temp">{maxTemp}°</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
