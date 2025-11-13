import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { createClient } from "@supabase/supabase-js";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 🔧 CONFIGURA QUI I TUOI DATI SUPABASE
const supabaseUrl = "https://hdemlowgkhcnepgbeehk.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZW1sb3dna2hjbmVwZ2JlZWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NDA1NjUsImV4cCI6MjA3NzIxNjU2NX0.a7LyKjmiwal9s9k6IYrNwgZeZd38rc5H3NVrz-RSf_I";
const supabase = createClient(supabaseUrl, supabaseKey);

type Poi = {
  id: number;
  name: string;
  description: string;
  category: string;
  elevation?: number;
  image_url?: string;
  coordinates: { lat: number; lon: number };
};

// 🗣️ Funzione helper per la sintesi vocale + bip sonoro
function speak(text: string, setToast?: (msg: string | null) => void) {
  if (!("speechSynthesis" in window)) {
    alert("La sintesi vocale non è supportata su questo browser.");
    return;
  }

  // 🔊 Bip prima della voce
  const context = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gainNode.gain.setValueAtTime(0.1, context.currentTime);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);

  // 🎙️ Voce narrante
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "it-IT";
  utterance.rate = 1;
  window.speechSynthesis.cancel();

  setTimeout(() => {
    window.speechSynthesis.speak(utterance);
  }, 250);

  if (setToast) {
    setToast("🎧 Sto leggendo...");
    utterance.onend = () => setToast(null);
  }
}

// 🔹 Icone per categoria
const icons: Record<string, L.Icon> = {
  Montagna: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
    iconSize: [32, 32],
  }),
  Città: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/3179/3179068.png",
    iconSize: [32, 32],
  }),
  Lago: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/727/727790.png",
    iconSize: [32, 32],
  }),
  Monumento: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448634.png",
    iconSize: [32, 32],
  }),
  Parco: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/535/535239.png",
    iconSize: [32, 32],
  }),
  Default: new L.Icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
    iconSize: [32, 32],
  }),
};

// 📍 Icona posizione utente
const userIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [38, 38],
  iconAnchor: [19, 38],
});

// -------------------- Recenter component --------------------
// Componente interno che sposta la mappa quando `position` cambia,
// ma solo se `follow` è true.
function RecenterMap({
  position,
  follow,
}: {
  position: [number, number] | null;
  follow: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !position) return;
    if (follow) {
      // Mantieni lo zoom corrente, ma centra la mappa sulla posizione
      map.setView(position, map.getZoom(), { animate: true });
    }
  }, [map, position, follow]);
  return null;
}
// ------------------------------------------------------------

function App() {
  const [pois, setPois] = useState<Poi[]>([]);
  const [filteredPois, setFilteredPois] = useState<Poi[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Tutte");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [radius, setRadius] = useState<number>(50); // km
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [status, setStatus] = useState("Caricamento...");
  const [toast, setToast] = useState<string | null>(null);
  const [mode, setMode] = useState<"walking" | "auto">("walking");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [followMap, setFollowMap] = useState<boolean>(true); // <-- follow toggle

  const lastSpokenPOI = useRef<string | null>(null);

  // 🔓 Sblocca completamente audio e voce al primo tocco/click (compatibile iOS)
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
  
        // 🔊 Emissione suono immediata (richiesta da iOS)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
  
        // 🗣️ Riproduzione vocale immediata
        const utterance = new SpeechSynthesisUtterance("Audio attivato");
        utterance.lang = "it-IT";
        utterance.rate = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
  
        setAudioUnlocked(true);
  
        // 🔒 Rimuove listener una volta sbloccato
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
      } catch (err) {
        console.warn("Errore nello sblocco audio:", err);
      }
    };
  
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // 🧭 Geolocalizzazione dinamica
  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus("Geolocalizzazione non supportata");
      return;
    }

    let watchId: number;
    const updatePosition = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      setPosition([latitude, longitude]);
      setStatus(
        `Posizione aggiornata (${mode === "auto" ? "🚗" : "🚶‍♂️"}) ${latitude.toFixed(
          5
        )}, ${longitude.toFixed(5)}`
      );
    };

    const handleError = (err: GeolocationPositionError) => {
      console.warn("Errore geolocalizzazione:", err.message);
      setStatus("Errore nella geolocalizzazione");
    };

    const options = {
      enableHighAccuracy: true,
      maximumAge: mode === "auto" ? 1000 : 5000,
      timeout: mode === "auto" ? 2000 : 10000,
    };

    watchId = navigator.geolocation.watchPosition(updatePosition, handleError, options);

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (mode === "auto") {
      pollInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(updatePosition, handleError, options);
      }, 2000);
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [mode]);

  // 🌙 Mantieni lo schermo sempre acceso mentre la webapp è attiva
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && (navigator as any).wakeLock.request) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
          console.log("🔋 Wake Lock attivo: schermo sempre acceso");

          wakeLock.addEventListener("release", () => {
            console.log("⚠️ Wake Lock rilasciato (forse cambio tab o standby)");
          });
        } else {
          console.warn("⚠️ Wake Lock API non supportata su questo dispositivo.");
        }
      } catch (err) {
        console.error("Errore attivazione Wake Lock:", err);
      }
    };

    requestWakeLock();

    // Se l’utente cambia tab o blocca il telefono, riattiva il lock al ritorno
    document.addEventListener("visibilitychange", () => {
      if (wakeLock !== null && document.visibilityState === "visible") {
        requestWakeLock();
      }
    });

    // Rilascia il lock quando il componente viene smontato
    return () => {
      if (wakeLock) {
        wakeLock.release().then(() => {
          console.log("🔓 Wake Lock disattivato");
        });
      }
    };
  }, []);

  // 📡 Caricamento POI da Supabase
  const loadPOI = async () => {
    const { data, error } = await supabase.rpc("get_poi_with_category");
    if (error) {
      console.error("Errore caricamento POI:", error);
      return;
    }

    const parsed = data.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category_name,
      elevation: p.elevation,
      image_url: p.image_url,
      coordinates: {
        lat: p.geojson.coordinates[1],
        lon: p.geojson.coordinates[0],
      },
    }));

    setPois(parsed);
    setFilteredPois(parsed);
    setCategories(["Tutte", ...Array.from(new Set(parsed.map((p: any) => p.category)))]);
    setStatus(`✅ Caricati ${parsed.length} punti da Supabase`);
  };

  useEffect(() => {
    loadPOI();
  }, []);

  // 📏 Calcolo distanza
  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // 🗣️ Narrazione automatica (entro ~100 m)
  useEffect(() => {
    if (!position || pois.length === 0 || !audioUnlocked) return;

    const nearby = pois.filter(
      (p) =>
        calcDistance(position[0], position[1], p.coordinates.lat, p.coordinates.lon) <=
        0.1
    );

    if (nearby.length > 0) {
      const poi = nearby[0];
      if (lastSpokenPOI.current !== poi.name) {
        lastSpokenPOI.current = poi.name;

        const description = `${poi.name}, categoria ${poi.category}. ${
          poi.elevation ? `Altitudine ${poi.elevation} metri. ` : ""
        }${poi.description ?? ""}`;
        speak(description, setToast);
      }
    } else {
      lastSpokenPOI.current = null;
    }
  }, [position, pois, audioUnlocked]);

  // 🎚️ Filtri
  useEffect(() => {
    if (!position) return;
    let results = pois;

    if (selectedCategory !== "Tutte") {
      results = results.filter((p) => p.category === selectedCategory);
    }
    if (searchTerm.trim()) {
      results = results.filter((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (radius !== 0) {
      results = results.filter(
        (p) =>
          calcDistance(position[0], position[1], p.coordinates.lat, p.coordinates.lon) <=
          radius
      );
    }

    setFilteredPois(results);
  }, [selectedCategory, searchTerm, radius, pois, position]);

  const handlePOIClick = (poi: Poi) => {
    const description = `${poi.name}, categoria ${poi.category}. ${
      poi.elevation ? `Altitudine ${poi.elevation} metri. ` : ""
    }${poi.description ?? ""}`;
    speak(description, setToast);
  };

  const stopSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setToast(null);
    }
  };

  // 🌍 INTERFACCIA COMPLETA
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* 🔈 Messaggio per attivare audio */}
      {!audioUnlocked && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#000",
            color: "#fff",
            padding: "20px",
            borderRadius: "12px",
            textAlign: "center",
            zIndex: 9999,
          }}
        >
          🔊 Tocca lo schermo per attivare l’audio
        </div>
      )}

      {position && (
        <MapContainer center={position} zoom={15} style={{ height: "100%", width: "100%" }}>
          {/* RecenterMap centrerà la mappa ogni volta che `position` cambia,
              ma solo se `followMap` è true */}
          <RecenterMap position={position} follow={followMap} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={position} icon={userIcon}>
            <Popup>📍 La tua posizione</Popup>
          </Marker>

          {radius > 0 && (
            <Circle
              center={position}
              radius={radius * 1000}
              pathOptions={{ color: "blue", fillColor: "#add8e6", fillOpacity: 0.2 }}
            />
          )}

          {filteredPois.map((p) => (
            <Marker
              key={p.id}
              position={[p.coordinates.lat, p.coordinates.lon]}
              icon={icons[p.category] || icons.Default}
            >
              <Popup>
                <b>{p.name}</b> <br />
                {p.elevation && <span>🏔️ Altitudine: {p.elevation} m<br /></span>}
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    style={{ width: "100px", borderRadius: "8px", margin: "4px 0" }}
                  />
                )}
                <br />
                {p.description}
                <br />
                <i>{p.category}</i>
                <br />
                <button
                  style={{
                    marginTop: "6px",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#4CAF50",
                    color: "white",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePOIClick(p)}
                >
                  🔊 Ascolta descrizione
                </button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}

      {/* 🎛️ CONTROLLI */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "white",
          padding: "10px 14px",
          borderRadius: "10px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          zIndex: 1000,
          fontSize: "0.9rem",
        }}
      >
        <div style={{ marginBottom: "6px" }}>
          <label>🧭 Modalità: </label>
          <button
            onClick={() => setMode("walking")}
            style={{
              marginRight: "5px",
              background: mode === "walking" ? "#4CAF50" : "#ddd",
              color: mode === "walking" ? "white" : "black",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            🚶‍♂️ A piedi
          </button>
          <button
            onClick={() => setMode("auto")}
            style={{
              background: mode === "auto" ? "#2196F3" : "#ddd",
              color: mode === "auto" ? "white" : "black",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            🚗 Auto
          </button>

          {/* Toggle follow map */}
          <button
            onClick={() => setFollowMap((s) => !s)}
            style={{
              marginLeft: "8px",
              background: followMap ? "#1976d2" : "#ddd",
              color: followMap ? "white" : "black",
              border: "none",
              borderRadius: "6px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
            title="Segui la posizione (toggle)"
          >
            {followMap ? "📍 Segui (On)" : "📍 Segui (Off)"}
          </button>
        </div>

        {/* 🔍 Ricerca */}
        <div style={{ marginBottom: "5px" }}>
          <label>🔍 Cerca: </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nome POI..."
          />
        </div>

        {/* 📂 Categoria */}
        <div style={{ marginBottom: "5px" }}>
          <label>📂 Categoria: </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 📏 Raggio */}
        <div style={{ marginBottom: "5px" }}>
          <label>📏 Raggio: </label>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            <option value={0}>Tutti</option>
            <option value={0.1}>100 m</option>
            <option value={1}>1 km</option>
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={20}>20 km</option>
            <option value={50}>50 km</option>
          </select>
        </div>

        <button onClick={loadPOI}>🔄 Ricarica POI</button>
        <button
          onClick={stopSpeech}
          style={{
            marginLeft: "8px",
            background: "#f44336",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          ⏹️ Ferma voce
        </button>

        <div style={{ marginTop: "4px", fontSize: "0.9em" }}>{status}</div>
      </div>

      {/* 🎧 Toast */}
      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#333",
            color: "white",
            padding: "10px 20px",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            fontSize: "1rem",
            zIndex: 2000,
            opacity: 0.9,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
