"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import * as turf from "@turf/turf";
import type { Position } from "@capacitor/geolocation";

type LocationUpdate = {
  id: string;
  lat: number;
  lon: number;
  accuracy: number;
};

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [statusHtml, setStatusHtml] = useState("Connecting...");
  const [users, setUsers] = useState<Record<string, LocationUpdate>>({});
  const [Leaflet, setLeaflet] = useState<any>(null);

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

  // Dynamically import Leaflet (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("leaflet").then((L) => {
      setLeaflet(L);
      require("leaflet/dist/leaflet.css");
    });
  }, []);

  useEffect(() => {
    if (!started || !Leaflet || !mapContainerRef.current) return;

    const L = Leaflet;
    const map = L.map(mapContainerRef.current, { center: mapCenter, zoom: 18 });
    leafletMapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 80 }).addTo(map);
    L.polygon(eacPolygon, { color: "blue", fillColor: "#3f83f8", fillOpacity: 0.3 }).addTo(map);

    function createOrUpdateMarker(id: string, lat: number, lon: number) {
      const existing = markersRef.current[id];
      if (existing) {
        existing.setLatLng([lat, lon]);
        return existing;
      }
      const marker = L.circleMarker([lat, lon], { radius: 6 });
      marker.addTo(map);
      markersRef.current[id] = marker;
      return marker;
    }

    // Change this to your public server domain
    const socket: Socket = io("https://eaclocate.onrender.com");
    socketRef.current = socket;

    socket.on("connect", () => setStatusHtml("Connected to server"));
    socket.on("disconnect", () => setStatusHtml("Disconnected"));

    socket.on("userLocationUpdate", (data: LocationUpdate) => {
      const { id, lat, lon, accuracy } = data;
      const polyCoords = eacPolygon.map(([lat, lon]) => [lon, lat] as [number, number]);
      const pt = turf.point([lon, lat] as [number, number]);
      const poly = turf.polygon([polyCoords]);
      const inside = turf.booleanPointInPolygon(pt, poly);

      const marker = createOrUpdateMarker(id, lat, lon);
      marker.bindPopup(
        `${id}<br>📍 ${inside ? "✅ Inside" : "❌ Outside"}<br>📏 ${inside ? "Within polygon" : "Outside polygon"}`
      );

      if (id === userId) {
        const newHtml = inside
          ? `✅ Inside EAC Polygon<br>Accuracy: ${accuracy.toFixed(1)} m`
          : `❌ Outside EAC Polygon<br>Accuracy: ${accuracy.toFixed(1)} m`;
        setStatusHtml(newHtml);
      }

      setUsers((prev) => ({ ...prev, [id]: data }));
    });

    socket.on("userDisconnected", (id: string) => {
      const marker = markersRef.current[id];
      if (marker) {
        map.removeLayer(marker);
        delete markersRef.current[id];
      }
      setUsers((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    });

    if (typeof window !== "undefined" && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude: lat, longitude: lon, accuracy } = position.coords;
          if (socket.connected && userId) {
            socket.emit("updateLocation", { id: userId, lat, lon, accuracy });
          }
        },
        (err) => console.error("watchPosition error:", err),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      socket.disconnect();
      map.remove();
      markersRef.current = {};
      setUsers({});
    };
  }, [started, Leaflet, userId]);

  const handleRemoveUser = (id: string) => {
    socketRef.current?.emit("removeUser", id);
  };

  const handleStart = () => {
    const trimmed = username.trim();
    if (!trimmed) return alert("Enter a username");
    setUserId(trimmed);
    setStarted(true);
    setStatusHtml("Initializing map...");
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black font-sans">
      <aside className="w-64 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Connected Users</h2>
        <ul className="space-y-2">
          {Object.entries(users).map(([id, user]) => (
            <li key={id} className="flex justify-between items-center p-2 rounded bg-gray-100 dark:bg-gray-800">
              <div>
                <span className="font-medium">{id}</span>
                <br />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Lat: {user.lat.toFixed(5)}, Lon: {user.lon.toFixed(5)}
                </span>
              </div>
              <button className="text-red-500 text-sm hover:underline" onClick={() => handleRemoveUser(id)}>
                Remove
              </button>
            </li>
          ))}
          {Object.keys(users).length === 0 && <li className="text-sm text-gray-500">No users connected</li>}
        </ul>
      </aside>

      <main className="flex-1 flex flex-col items-center justify-start py-6 px-4">
        {!started ? (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md text-center">
            <h3 className="text-xl font-semibold mb-3">Enter your username</h3>
            <div className="flex gap-2 justify-center">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="p-2 border rounded w-60"
              />
              <button onClick={handleStart} className="px-4 py-2 bg-foreground text-white rounded">
                Start
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Uses browser geolocation.</p>
          </div>
        ) : (
          <>
            <div ref={mapContainerRef} id="map" style={{ height: "80vh", width: "100%", borderRadius: 8 }} />
            <div className="mt-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-sm" dangerouslySetInnerHTML={{ __html: statusHtml }} />
          </>
        )}
      </main>
    </div>
  );
}
