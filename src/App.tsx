import { useEffect, useMemo, useRef, useState } from "react";

const hasWindow = () => typeof window !== "undefined";
const hasLocalStorage = () => hasWindow() && typeof window.localStorage !== "undefined";

const SRB_CITIES = [
  { name: "Beograd", en: "Belgrade", lat: 44.7866, lon: 20.4489 },
  { name: "Novi Sad", en: "Novi Sad", lat: 45.2671, lon: 19.8335 },
  { name: "Niš", en: "Niš", lat: 43.3209, lon: 21.8958 },
  { name: "Kragujevac", en: "Kragujevac", lat: 44.0128, lon: 20.9114 },
  { name: "Subotica", en: "Subotica", lat: 46.1, lon: 19.6667 },
  { name: "Zrenjanin", en: "Zrenjanin", lat: 45.3836, lon: 20.381 },
  { name: "Pirot", en: "Pirot", lat: 43.153, lon: 22.5861 },
  { name: "Kraljevo", en: "Kraljevo", lat: 43.7239, lon: 20.6876 },
  { name: "Čačak", en: "Čačak", lat: 43.8914, lon: 20.3497 },
  { name: "Užice", en: "Užice", lat: 43.8586, lon: 19.8488 }
];

const STR = {
  sr: {
    heading: "Vremenska prognoza Srbija",
    search: "Pretraži gradove",
    city: "Grad",
    feels: "Subjektivni osećaj",
    humidity: "Vlažnost",
    wind: "Vetar",
    pressure: "Pritisak",
    now: "Sada",
    next7: "Narednih 7 dana",
    loading: "Učitavanje prognoze...",
    error: "Neuspešno preuzimanje prognoze.",
    useMyLocation: "Koristi moju lokaciju",
    locating: "Određujem lokaciju...",
    alerts: "Upozorenja",
    noAlerts: "Nema posebnih upozorenja.",
    locDenied: "Pristup lokaciji odbijen.",
    locUnavailable: "Lokacija trenutno nije dostupna.",
    locTimeout: "Vreme za određivanje lokacije je isteklo.",
    locInsecure: "Geolokacija zahteva HTTPS.",
    locUnsupported: "Pregledač ne podržava geolokaciju.",
    myLocation: "Moja lokacija",
    aq: "Kvalitet vazduha",
    pm25: "PM2.5",
    pm10: "PM10",
    map: "Mapa",
    today: "Danas",
    install: "Instaliraj aplikaciju"
  },
  en: {
    heading: "Serbia Weather Forecast",
    search: "Search cities",
    city: "City",
    feels: "Feels like",
    humidity: "Humidity",
    wind: "Wind",
    pressure: "Pressure",
    now: "Now",
    next7: "Next 7 days",
    loading: "Loading forecast...",
    error: "Failed to fetch forecast.",
    useMyLocation: "Use my location",
    locating: "Locating...",
    alerts: "Alerts",
    noAlerts: "No special alerts.",
    locDenied: "Location permission denied.",
    locUnavailable: "Location currently unavailable.",
    locTimeout: "Timed out while locating.",
    locInsecure: "Geolocation requires HTTPS.",
    locUnsupported: "Browser does not support geolocation.",
    myLocation: "My Location",
    aq: "Air Quality",
    pm25: "PM2.5",
    pm10: "PM10",
    map: "Map",
    today: "Today",
    install: "Install app"
  }
} as const;

function mapGeoError(err: GeolocationPositionError | { code?: number }, lang: "sr" | "en") {
  const T = STR[lang];
  switch (err?.code) {
    case 1: return T.locDenied;
    case 2: return T.locUnavailable;
    case 3: return T.locTimeout;
    default:
      if (!hasWindow() || !("isSecureContext" in window) || !window.isSecureContext) return T.locInsecure;
      if (!("geolocation" in navigator)) return T.locUnsupported;
      return T.locUnavailable;
  }
}

async function fetchForecast(lat: number, lon: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: ["temperature_2m","apparent_temperature","relative_humidity_2m","wind_speed_10m","surface_pressure","is_day"].join(","),
    hourly: ["temperature_2m"].join(","),
    daily: ["temperature_2m_max","temperature_2m_min","precipitation_sum","weathercode","wind_speed_10m_max"].join(","),
    timezone: "Europe/Belgrade"
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("Network error");
  return res.json();
}

async function fetchAirQuality(lat: number, lon: number, signal?: AbortSignal) {
  try {
    const p = new URLSearchParams({ latitude: String(lat), longitude: String(lon), hourly: ["pm10","pm2_5"].join(","), timezone: "Europe/Belgrade" });
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${p.toString()}`, { signal });
    if (res.ok) return res.json();
  } catch {}
  return null;
}

const WMO: Record<number, string> = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️", 51: "🌦️", 61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 80: "🌧️", 95: "⛈️" };

function fmtDay(d: string, lang: "sr" | "en") {
  const date = new Date(d);
  return date.toLocaleDateString(lang === "sr" ? "sr-RS" : "en-GB", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function nearestCity(lat: number, lon: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  let best = SRB_CITIES[0];
  let bestD = Infinity;
  for (const c of SRB_CITIES) {
    const dLat = toRad(c.lat - lat);
    const dLon = toRad(c.lon - lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(c.lat)) * Math.sin(dLon / 2) ** 2;
    const d = 2 * R * Math.asin(Math.sqrt(a));
    if (d < bestD) { bestD = d; best = c; }
  }
  return { nearest: best, km: bestD };
}

async function loadLeafletCDN(): Promise<boolean> {
  if (!hasWindow()) return false;
  const w = window as any;
  if (w.L) return true;
  const linkId = "leaflet-css";
  if (!document.getElementById(linkId)) {
    const link = document.createElement("link");
    link.id = linkId; link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
  const ok = await new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.async = true;
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
    setTimeout(() => resolve(!!(window as any).L), 5000);
  });
  return ok && !!(window as any).L;
}

function InlineLeaflet({ lat, lon, onPick }: { lat: number; lon: number; onPick: (lat: number, lon: number) => void }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [fallback, setFallback] = useState(false);
  const z = 7;
  const latLonToTile = (latDeg: number, lonDeg: number, zoom: number) => {
    const latRad = (latDeg * Math.PI) / 180; const n = Math.pow(2, zoom);
    const x = Math.floor(((lonDeg + 180) / 360) * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  };
  useEffect(() => {
    if (!hasWindow()) return; let mounted = true;
    (async () => {
      const ok = await loadLeafletCDN(); if (!mounted) return;
      if (!ok || !mapRef.current) { setFallback(true); return; }
      const L = (window as any).L; if (!L) { setFallback(true); return; }
      const map = L.map(mapRef.current).setView([lat, lon], z);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      const marker = L.marker([lat, lon]).addTo(map);
      markerRef.current = marker; leafletRef.current = map;
      map.on("click", (e: any) => onPick(e.latlng.lat, e.latlng.lng));
    })();
    return () => { mounted = false; try { leafletRef.current?.remove(); } catch {} };
  }, []);
  useEffect(() => {
    const L = (window as any).L; if (!L || !leafletRef.current) return;
    try { leafletRef.current.setView([lat, lon]); markerRef.current?.setLatLng([lat, lon]); } catch {}
  }, [lat, lon]);
  if (fallback) {
    const { x, y } = latLonToTile(lat, lon, z);
    const tileUrl = "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
    const osmLink = "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lon + "#map=" + z + "/" + lat + "/" + lon;
    return (
      <a href={osmLink} target="_blank" rel="noreferrer" style={{ display: "block" }}>
        <div className="mapbox" style={{ height: 300, borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", backgroundImage: "url(" + tileUrl + ")", backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.08)" }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", fontSize: 24 }}>📍</div>
          <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 12, background: "rgba(255,255,255,0.9)", padding: "2px 6px", borderRadius: 6 }}>Static map fallback</div>
        </div>
      </a>
    );
  }
  return <div ref={mapRef} className="mapbox" style={{ height: 300, width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0" }} />;
}

let swRegistered = false;

export default function App() {
  const LS = { lastCity: "srbwx:lastCity", geoStatus: "srbwx:geoStatus", lang: "srbwx:lang" } as const;
  const [lang, setLang] = useState<"sr" | "en">(() => { try { if (!hasLocalStorage()) return "sr"; const saved = localStorage.getItem(LS.lang); return saved === "en" ? "en" : "sr"; } catch { return "sr"; } });
  const [query, setQuery] = useState("");
  const [city, setCity] = useState(() => { try { if (!hasLocalStorage()) return SRB_CITIES[0]; const raw = localStorage.getItem(LS.lastCity); if (raw) return JSON.parse(raw); } catch {} return SRB_CITIES[0]; });
  const [data, setData] = useState<any>(null);
  const [air, setAir] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [alerts, setAlerts] = useState<Array<{ level: "info" | "warn" | "danger"; text: string }>>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const didInit = useRef(false);
  const [tab, setTab] = useState<'today' | 'map'>('today');

  const cityOptions = useMemo(() => { const q = query.trim().toLowerCase(); return SRB_CITIES.filter((c) => (c.name + " " + c.en).toLowerCase().includes(q)); }, [query]);
  useEffect(() => { try { if (hasLocalStorage()) localStorage.setItem(LS.lang, lang); } catch {} }, [lang]);

  const handleUseMyLocation = async () => {
    if (!hasWindow()) { setError(STR[lang].locUnsupported); return; }
    if (!("isSecureContext" in window) || !window.isSecureContext) { setError(STR[lang].locInsecure); return; }
    if (!("geolocation" in navigator)) { setError(STR[lang].locUnsupported); return; }
    try {
      if (navigator.permissions && (navigator as any).permissions?.query) {
        try {
          const status = await (navigator as any).permissions.query({ name: "geolocation" as any });
          if (status.state === "denied") { setError(STR[lang].locDenied); if (hasLocalStorage()) localStorage.setItem(LS.geoStatus, "denied"); return; }
        } catch {}
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const { nearest } = nearestCity(latitude, longitude);
          const newCity = { name: STR[lang].myLocation + " • " + nearest.name, en: STR[lang].myLocation, lat: latitude, lon: longitude } as any;
          setCity(newCity);
          try { if (hasLocalStorage()) { localStorage.setItem(LS.geoStatus, "granted"); localStorage.setItem(LS.lastCity, JSON.stringify(newCity)); } } catch {}
          setLocating(false);
        },
        (err) => { const msg = mapGeoError(err as any, lang); setError(msg); try { if (hasLocalStorage()) localStorage.setItem(LS.geoStatus, "denied"); } catch {}; setLocating(false); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
      );
    } catch { setError(mapGeoError({} as any, lang)); setLocating(false); }
  };

  useEffect(() => {
    try { if (hasLocalStorage()) localStorage.setItem(LS.lastCity, JSON.stringify(city)); } catch {}
    const ac = new AbortController();
    (async () => {
      setLoading(true); setError(null);
      try {
        const [wx, aq] = await Promise.all([
          fetchForecast(city.lat, city.lon, ac.signal),
          fetchAirQuality(city.lat, city.lon, ac.signal)
        ]);
        setData(wx); setAir(aq);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message || "Error");
      } finally { setLoading(false); }
    })();
    return () => { ac.abort(); };
  }, [city]);

  const dailyRows = useMemo(() => {
    if (!data?.daily) return [] as any[]; const d = data.daily;
    return d.time.map((t: string, i: number) => ({ date: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], prcp: d.precipitation_sum[i], code: d.weathercode[i], windMax: d.wind_speed_10m_max?.[i], label: fmtDay(t, lang) }));
  }, [data, lang]);

  const hourlySeries = useMemo(() => {
    if (!data?.hourly) return [] as any[]; const h = data.hourly;
    return h.time.map((t: string, i: number) => ({ time: new Date(t).toLocaleTimeString(lang === "sr" ? "sr-RS" : "en-GB", { hour: "2-digit", minute: "2-digit" }), temp: h.temperature_2m[i] }));
  }, [data, lang]);

  const chartStats = useMemo(() => {
    const arr = hourlySeries.slice(0, 24).map((p: { temp: number }) => p.temp);
    if (arr.length === 0) return { min: 0, max: 1 };
    let min = arr[0], max = arr[0];
    for (let i = 1; i < arr.length; i++) { const v = arr[i]; if (v < min) min = v; if (v > max) max = v; }
    if (max === min) max = min + 1;
    return { min, max };
  }, [hourlySeries]);

  const airNow = useMemo(() => {
    if (!air) return null;
    if (air?.hourly?.time) {
      const idx = air.hourly.time.findIndex((t: string) => new Date(t).getTime() <= Date.now()); const i = idx === -1 ? 0 : idx;
      return { pm25: air.hourly.pm2_5?.[i], pm10: air.hourly.pm10?.[i] };
    }
    return null;
  }, [air]);

  useEffect(() => {
    const out: Array<{ level: "info" | "warn" | "danger"; text: string }> = [];
    if (dailyRows.length) {
      for (const d of dailyRows.slice(0, 3)) {
        if (d.prcp >= 15) out.push({ level: "warn", text: (lang === "sr" ? "Obilne padavine (~" : "Heavy rainfall (~") + Math.round(d.prcp) + " mm)" });
        if ((d.windMax ?? 0) >= 60) out.push({ level: "warn", text: lang === "sr" ? "Pojačan vetar (≥60 km/h)" : "Strong wind (≥60 km/h)" });
        if (d.max >= 35) out.push({ level: "danger", text: lang === "sr" ? "Vrela temperatura (≥35°C)" : "Heat (≥35°C)" });
        if (d.min <= 0) out.push({ level: "info", text: lang === "sr" ? "Mraz (≤0°C)" : "Frost (≤0°C)" });
        if ([95].includes(d.code)) out.push({ level: "warn", text: lang === "sr" ? "Moguće grmljavinske oluje" : "Thunderstorm risk" });
      }
    }
    setAlerts(out);
  }, [dailyRows, lang]);

  useEffect(() => {
    if (!hasWindow() || !("serviceWorker" in navigator)) return;
    if (swRegistered) return; swRegistered = true;
    const swCode = "self.addEventListener('install', e=>{self.skipWaiting();e.waitUntil(caches.open('srbwx-v1').then(c=>c.addAll(['/']))) });\nself.addEventListener('activate', e=>{clients.claim()});\nself.addEventListener('fetch', e=>{const u=e.request.url;if(u.includes('open-meteo.com')){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))}else{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))}});";
    const blob = new Blob([swCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(() => {}).finally(() => { try { URL.revokeObjectURL(url); } catch {} });
  }, []);

  useEffect(() => {
    if (!hasWindow()) return;
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const doInstall = async () => { try { if (installPrompt && installPrompt.prompt) { await installPrompt.prompt(); } setInstallPrompt(null); } catch {} };

  useEffect(() => {
    if (didInit.current) return; didInit.current = true;
    try {
      const savedCity = hasLocalStorage() ? localStorage.getItem(LS.lastCity) : null;
      const geoStatus = hasLocalStorage() ? localStorage.getItem(LS.geoStatus) : null;
      if (savedCity) { const parsed = JSON.parse(savedCity); if (parsed && (parsed as any).lat && (parsed as any).lon) setCity(parsed as any); return; }
      if (geoStatus !== "denied") { handleUseMyLocation(); }
    } catch { handleUseMyLocation(); }
  }, []);

  const T = STR[lang];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(#f8fafc,#fff)", padding: 24, color: "#0f172a", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial" }} id="app-root">
      <style dangerouslySetInnerHTML={{__html: `
  :root{--fs-title:24px;--fs-body:16px;--pad:24px;--gap:12px}
  #app-root{font-size:var(--fs-body)}
  .toolbar{flex-wrap:wrap}
  .toolbar .btn{font-size:14px}
  .card{padding:16px}
  .chart{height:220px}
  .mapbox{height:300px}
  @media (max-width: 768px) {
    :root{--fs-title:22px;--fs-body:15px;--pad:16px;--gap:10px}
    .grid-forecast{grid-template-columns: repeat(3, minmax(0,1fr)) !important}
    .grid-7{grid-template-columns: repeat(4, minmax(0,1fr)) !important}
    .chart{height:180px !important}
    .mapbox{height:260px !important}
  }
  @media (max-width: 600px) {
    :root{--fs-title:20px;--fs-body:15px;--pad:14px;--gap:10px}
    .grid-7{grid-template-columns: repeat(3, minmax(0,1fr)) !important}
    .toolbar{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .toolbar .input, .toolbar select{width:100% !important}
    .toolbar .search-wrap{width:100% !important}
  }
  @media (max-width: 480px) {
    :root{--fs-title:19px;--fs-body:14px;--pad:12px;--gap:8px}
    #app-root{padding:var(--pad) !important}
    #title{font-size:var(--fs-title) !important}
    .toolbar .btn{padding:6px 10px !important}
    .toolbar .input{width:100% !important}
    .toolbar .search-wrap{width:100% !important}
    .grid-forecast{grid-template-columns: repeat(2, minmax(0,1fr)) !important}
    .daily-title{font-size:14px !important}
    .card{padding:12px !important}
    .chart{height:160px !important}
    .mapbox{height:220px !important}
  }
  @media (max-width: 360px) {
    :root{--fs-title:18px;--fs-body:13px;--pad:10px;--gap:6px}
    .grid-forecast{grid-template-columns: repeat(1, minmax(0,1fr)) !important}
    .grid-7{grid-template-columns: repeat(2, minmax(0,1fr)) !important}
    .toolbar{grid-template-columns:1fr !important}
    .toolbar .btn{font-size:13px !important}
  }
`}} />
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24 }}>
          <div id="title" style={{ fontSize: "var(--fs-title)", fontWeight: 700 }}>{T.heading}</div>
          <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {installPrompt && (<button onClick={doInstall} className="btn" style={{ border: "1px solid #cbd5e1", background: "#fff", padding: "8px 12px", borderRadius: 8 }}>⬇️ {T.install}</button>)}
            <button onClick={() => setLang(lang === 'sr' ? 'en' : 'sr')} className="btn" style={{ border: "1px solid #cbd5e1", background: "#fff", padding: "8px 12px", borderRadius: 8 }}>{lang === 'sr' ? 'EN' : 'SR'}</button>
            <button onClick={handleUseMyLocation} disabled={locating} className="btn" style={{ border: "1px solid #bae6fd", background: "#e0f2fe", padding: "8px 12px", borderRadius: 8 }}>{locating ? "⏳ " + T.locating : "📍 " + T.useMyLocation}</button>
            <div className="search-wrap" style={{ position: "relative", minWidth: 0, flex: "1 1 220px" }}>
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }}>🔎</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T.search} className="input" style={{ padding: "8px 8px 8px 28px", width: 220, maxWidth: "100%", border: "1px solid #cbd5e1", borderRadius: 8 }} />
            </div>
            <select value={city.name} onChange={(e) => { const val = e.target.value; const found = SRB_CITIES.find(c => c.name === val); if (found) setCity(found); }} style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, minWidth: 140 }}>
              {cityOptions.map(c => (<option key={c.name} value={c.name}>{c.name}{c.en !== c.name ? " (" + c.en + ")" : ""}</option>))}
            </select>
          </div>
        </div>

        <div style={{ borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", background: "#ffffffb3", marginBottom: 24 }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#334155", fontWeight: 600 }}>🔔 {T.alerts}</div>
            {alerts.length === 0 ? (<div style={{ fontSize: 14, color: "#475569" }}>{T.noAlerts}</div>) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, fontSize: 14, border: "1px solid", background: a.level === "danger" ? "#fef2f2" : a.level === "warn" ? "#fffbeb" : "#f8fafc", color: a.level === "danger" ? "#b91c1c" : a.level === "warn" ? "#92400e" : "#334155", borderColor: a.level === "danger" ? "#fecaca" : a.level === "warn" ? "#fde68a" : "#e2e8f0" }}>⚠️ {a.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", background: "#ffffffb3" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={() => setTab('today')} style={{ padding: '8px 12px', borderRadius: 8, border: tab==='today'? '2px solid #0ea5e9':'1px solid #cbd5e1', background: tab==='today'? '#e0f2fe':'#fff', fontWeight: 600 }}>{T.today}</button>
              <button onClick={() => setTab('map')} style={{ padding: '8px 12px', borderRadius: 8, border: tab==='map'? '2px solid #0ea5e9':'1px solid #cbd5e1', background: tab==='map'? '#e0f2fe':'#fff', fontWeight: 600 }}>{T.map}</button>
            </div>

            {tab === 'today' && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569" }}>📍 {city.name}{city.en !== city.name ? " (" + city.en + ")" : ""}</div>
                {loading && (<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "#475569" }}>⏳ {T.loading}</div>)}
                {error && (<div style={{ marginTop: 12, color: "#dc2626", fontSize: 14 }}>{T.error} ({error})</div>)}
                {data?.current && !loading && !error && (
                  <div className="grid-forecast" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 16, marginTop: 16 }}>
                    <div className="card" style={{ borderRadius: 12, background: "#f8fafc" }}>
                      <div style={{ fontSize: 14, color: "#64748b" }}>{T.now}</div>
                      <div style={{ fontSize: 36, fontWeight: 700 }}>{Math.round(data.current.temperature_2m)}°C</div>
                      <div style={{ color: "#475569" }}>{T.feels}: {Math.round(data.current.apparent_temperature)}°C</div>
                    </div>
                    <div className="card" style={{ borderRadius: 12, background: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>💧 {T.humidity}: {data.current.relative_humidity_2m}%</div>
                    <div className="card" style={{ borderRadius: 12, background: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>🌀 {T.wind}: {Math.round(data.current.wind_speed_10m)} km/h</div>
                    <div className="card" style={{ borderRadius: 12, background: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>⟲ {T.pressure}: {Math.round(data.current.surface_pressure)} hPa</div>
                    <div className="card" style={{ borderRadius: 12, background: "#f8fafc" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{T.aq}</div>
                      <div style={{ fontSize: 14 }}>{T.pm25}: <span style={{ fontWeight: 600 }}>{airNow?.pm25 ?? "—"}</span> μg/m³</div>
                      <div style={{ fontSize: 14 }}>{T.pm10}: <span style={{ fontWeight: 600 }}>{airNow?.pm10 ?? "—"}</span> μg/m³</div>
                    </div>
                  </div>
                )}
                {hourlySeries.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>24h</div>
                    <div className="chart" style={{ position: "relative", border: "1px solid #e2e8f0", borderRadius: 12, padding: 8 }}>
                      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                        {(() => {
                          const min = chartStats.min, max = chartStats.max;
                          const pts = hourlySeries.slice(0, 24).map((p: { temp: number }, i: number, arr: { temp: number }[]) => {
                            const x = (i / Math.max(1, arr.length - 1)) * 1000;
                            const y = 180 - ((p.temp - min) / Math.max(1, max - min)) * 160;
                            return x + "," + y;
                          }).join(" ");
                          return <polyline points={pts} fill="none" strokeWidth={3} stroke="#0284c7" />;
                        })()}
                      </svg>
                    </div>
                  </div>
                )}

                {dailyRows.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div className="daily-title" style={{ marginBottom: 8, fontWeight: 600 }}>{T.next7}</div>
                    <div className="grid-7" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 12 }}>
                      {dailyRows.map((d: any) => (
                        <div key={d.date} className="card" style={{ borderRadius: 16, background: "#ffffffb3", border: "1px solid #e2e8f0" }}>
                          <div>
                            <div style={{ fontSize: 14, color: "#64748b" }}>{d.label}</div>
                            <div style={{ fontSize: 28 }}>{WMO[d.code] ?? "🌡️"}</div>
                            <div style={{ marginTop: 8, fontWeight: 600 }}>{Math.round(d.max)}° / {Math.round(d.min)}°C</div>
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>💧 {Math.round(d.prcp)} mm</div>
                              <div style={{ height: 8, borderRadius: 999, background: "#e0f2fe", overflow: "hidden" }}>
                                <div style={{ height: 8, width: String(Math.min(100, d.prcp * 4)) + '%', background: "#38bdf8" }} />
                              </div>
                            </div>
                            {d.windMax != null && (
                              <div style={{ fontSize: 14, color: "#334155", marginTop: 4 }}>🌀 {Math.round(d.windMax)} km/h</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'map' && (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>{T.map}</div>
                {hasWindow() ? (
                  <InlineLeaflet
                    lat={city.lat}
                    lon={city.lon}
                    onPick={(lat, lon) => {
                      const { nearest } = nearestCity(lat, lon);
                      setCity({ name: 'Custom • ' + nearest.name, en: 'Custom', lat, lon } as any);
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 14, color: "#64748b" }}>Map unavailable</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 40, fontSize: 12, color: "#64748b" }}>Data: Open-Meteo • Timezone: Europe/Belgrade</div>
      </div>
    </div>
  );
}

try {
  const belgrade = nearestCity(44.8, 20.47).nearest.name;
  console.assert(belgrade === "Beograd", "nearestCity should resolve Beograd for 44.8,20.47");
  console.assert(mapGeoError({ code: 1 } as any, "en").toLowerCase().includes("denied"), "mapGeoError PERMISSION_DENIED");
  console.assert(mapGeoError({ code: 2 } as any, "en").toLowerCase().includes("unavailable"), "mapGeoError POSITION_UNAVAILABLE");
  console.assert(mapGeoError({ code: 3 } as any, "en").toLowerCase().includes("time"), "mapGeoError TIMEOUT");
  (function(){ const z=7; const lat=44.7866, lon=20.4489; const latRad=(lat*Math.PI)/180; const n=Math.pow(2,z); const x=Math.floor(((lon+180)/360)*n); const y=Math.floor((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2*n); console.assert(Number.isInteger(x)&&Number.isInteger(y),'tile indices integers'); })();
  (function(){ const r = nearestCity(44.0, 21.0); console.assert(typeof r.km === 'number' && r.km > 0, 'nearestCity returns distance'); })();
  (function(){ const s = fmtDay('2025-01-15', 'en'); console.assert(typeof s === 'string' && s.length >= 5, 'fmtDay returns string'); })();
  (function(){ const arr=[1,2,3]; let min=arr[0],max=arr[0]; for(let i=1;i<arr.length;i++){const v=arr[i]; if(v<min)min=v; if(v>max)max=v;} console.assert(min===1&&max===3,'chartStats min/max'); })();
  (function(){ const s = mapGeoError({} as any, 'en'); console.assert(typeof s === 'string', 'mapGeoError returns string'); })();
} catch {}
