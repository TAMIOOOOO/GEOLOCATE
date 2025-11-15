"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";

type LocationUpdate = {
  id: string;
  lat?: number;
  lon?: number;
  accuracy?: number;
  lastInside?: string;
  lastSeen?: string;
};

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const socketRef = useRef<Socket | null>(null);

  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [statusHtml, setStatusHtml] = useState("Connecting...");
  const [users, setUsers] = useState<Record<string, LocationUpdate>>({});
  const [Leaflet, setLeaflet] = useState<any>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // hamburger dropdown state

  const eacPolygon: Array<[number, number]> = [
    [14.582820, 120.986910],
    [14.582820, 120.987050],
    [14.582790, 120.987120],
    [14.582740, 120.987150],
    [14.582700, 120.987140],
    [14.582680, 120.987070],
    [14.582690, 120.986950],
    [14.582740, 120.986910],
    [14.582820, 120.986910],
  ];

  const mapCenter: [number, number] = [14.582750, 120.987030];

  // Load Leaflet dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((L) => setLeaflet(L));
  }, []);

  // Socket.IO initialization (unchanged)
  useEffect(() => {
    const socket = io("http://localhost:3000");
    socketRef.current = socket;

    socket.on("connect", () => setStatusHtml("Connected to server"));
    socket.on("disconnect", () => setStatusHtml("Disconnected"));

    socket.on(
      "loginSuccess",
      ({ schoolId, isAdmin }: { schoolId: string; isAdmin: boolean }) => {
        setUserId(schoolId);
        setIsAdmin(isAdmin);
        setStarted(true);
        setStatusHtml("Logged in successfully");
        localStorage.setItem("schoolId", schoolId);
        localStorage.setItem("isAdmin", JSON.stringify(isAdmin));
        if (isAdmin) window.location.href = "/admin";
      }
    );

    socket.on("loginFailed", (msg: string) => {
      alert(msg);
      setStarted(false);
      setUserId(null);
    });

    socket.on("registerSuccess", (msg: string) => {
      alert(msg);
      setIsRegister(false);
    });

    socket.on("registerFailed", (msg: string) => alert(msg));

    socket.on("currentUsers", (existingUsers: Record<string, LocationUpdate>) =>
      setUsers(existingUsers)
    );

    socket.on("userLocationUpdate", (data: LocationUpdate) => {
      const id = data.id ?? "unknown";
      const lat = data.lat != null ? Number(data.lat) : undefined;
      const lon = data.lon != null ? Number(data.lon) : undefined;
      const accuracy = data.accuracy != null ? Number(data.accuracy) : undefined;

      let lastInside = data.lastInside;
      const lastSeen = new Date().toISOString();

      if (!isNaN(lat ?? NaN) && !isNaN(lon ?? NaN) && Leaflet && leafletMapRef.current) {
        const L = Leaflet;
        const polyCoords = eacPolygon.map(([lat, lon]) => [lon, lat] as [number, number]);
        const pt = turf.point([lon!, lat!]);
        const poly = turf.polygon([polyCoords]);
        const inside = turf.booleanPointInPolygon(pt, poly);

        if (inside) lastInside = new Date().toISOString();

        if (markersRef.current[id]) {
          markersRef.current[id].setLatLng([lat!, lon!]);
        } else {
          const marker = L.circleMarker([lat!, lon!], { radius: 6 });
          marker.addTo(leafletMapRef.current);
          markersRef.current[id] = marker;
        }

        markersRef.current[id].bindPopup(
          `${id}<br>📍 ${inside ? "✅ Inside" : "❌ Outside"}<br>Accuracy: ${accuracy?.toFixed(1) ?? "-"} m`
        );
      }

      setUsers((prev) => ({
        ...prev,
        [id]: { id, lat, lon, accuracy, lastInside, lastSeen },
      }));
    });

    socket.on("userDisconnected", (id: string) => {
      const marker = markersRef.current[id];
      if (marker && leafletMapRef.current) {
        leafletMapRef.current.removeLayer(marker);
        delete markersRef.current[id];
      }
      setUsers((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    });

    const heartbeat = setInterval(() => {
      if (userId) socket.emit("heartbeat", { schoolId: userId });
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
    };
  }, [Leaflet, userId]);

  // Initialize Map
  useEffect(() => {
    if (!started || !Leaflet || !mapContainerRef.current) return;
    const L = Leaflet;
    const map = L.map(mapContainerRef.current, { center: mapCenter, zoom: 18 });
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 80 }).addTo(map);
    L.polygon(eacPolygon, { color: "blue", fillColor: "#3f83f8", fillOpacity: 0.3 }).addTo(map);

    if (navigator.geolocation && userId) {
      const watchId = navigator.geolocation.watchPosition(
        ({ coords: { latitude, longitude, accuracy } }) => {
          if (!isNaN(latitude) && !isNaN(longitude)) {
            socketRef.current?.emit("updateLocation", { schoolId: userId, lat: latitude, lon: longitude, accuracy });
          }
        },
        (err) => console.error("watchPosition error:", err),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [started, Leaflet, userId]);

  const handleStart = () => {
    const sId = schoolId.trim();
    const pw = password.trim();
    if (!sId || !pw) return alert("Enter School ID and Password");
    socketRef.current?.emit("login", { schoolId: sId, password: pw });
  };

  const handleRegister = () => {
    const sId = schoolId.trim();
    const pw = password.trim();
    if (!sId || !pw) return alert("Enter School ID and Password");
    socketRef.current?.emit("register", { schoolId: sId, password: pw });
  };

  const handleLogout = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
      markersRef.current = {};
    }

    localStorage.removeItem("schoolId");
    localStorage.removeItem("isAdmin");
    setUserId(null);
    setIsAdmin(false);
    setStarted(false);
    setSchoolId("");
    setPassword("");
    setStatusHtml("Disconnected");
    setMenuOpen(false);
  };

  const isUserActive = (lastSeen?: string) => {
    if (!lastSeen) return false;
    return new Date().getTime() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black font-sans">
      {/* Main Header */}
      <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-8 flex items-center justify-center relative">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 absolute left-1/2 transform -translate-x-1/2">
          User Dashboard
        </h1>

        {/* Hamburger dropdown */}
        {started && (
          <div className="absolute right-4">
            <button
              className="flex flex-col justify-between w-6 h-6 p-1 focus:outline-none"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
              <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
              <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-200 dark:border-gray-700 z-50000">
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Logout
                </button>
                {/* Add more menu items here if needed */}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {started && (
          <aside className="w-64 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4">Your Information</h2>
            <ul className="space-y-2">
              {userId && users[userId] ? (
                <li className="flex flex-col p-2 rounded bg-gray-100 dark:bg-gray-800">
                  <span className="font-medium">{userId}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Lat: {users[userId].lat?.toFixed(5) ?? "-"} <br />
                    Lon: {users[userId].lon?.toFixed(5) ?? "-"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Last inside: {users[userId].lastInside ? new Date(users[userId].lastInside).toLocaleString() : "Never"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Last updated: {users[userId].lastSeen ? new Date(users[userId].lastSeen).toLocaleString() : "Never"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Status: {isUserActive(users[userId].lastSeen) ? "🟢 Active" : "⚪ Idle"}
                  </span>
                </li>
              ) : (
                <li className="text-sm text-gray-500">No coordinates yet</li>
              )}
            </ul>
          </aside>
        )}

        <main className="flex-1 flex flex-col items-center justify-start py-6 px-4">
          {!started ? (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md text-center">
              <h3 className="text-xl font-semibold mb-3">{isRegister ? "Register New User" : "Enter School ID & Password"}</h3>
              <div className="flex flex-col gap-2 justify-center items-center">
                <input value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="School ID" className="p-2 border rounded w-60" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="p-2 border rounded w-60" />
                <button onClick={isRegister ? handleRegister : handleStart} className="px-4 py-2 bg-foreground text-white rounded mt-2">
                  {isRegister ? "Register" : "Start"}
                </button>
                <button className="text-xs text-blue-500 mt-2 hover:underline" onClick={() => setIsRegister(!isRegister)}>
                  {isRegister ? "Go to Login" : "Register New User"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Uses browser geolocation.</p>
            </div>
          ) : (
            <div className="flex-1 w-full">
              <div ref={mapContainerRef} id="map" style={{ height: "80vh", width: "100%", borderRadius: 8 }} />
              <div className="mt-2 px-2 py-1 rounded text-sm" dangerouslySetInnerHTML={{ __html: statusHtml }} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
