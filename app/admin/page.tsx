"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";

type LocationUpdate = {
  lat?: number;
  lon?: number;
  accuracy?: number;
  lastInside?: string;
  lastSeen?: string;
  active?: boolean;
};

type Toast = {
  id: string;
  message: string;
};

export default function Admin() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const socketRef = useRef<Socket | null>(null);

  const [users, setUsers] = useState<Record<string, LocationUpdate>>({});
  const [Leaflet, setLeaflet] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!Leaflet || !mapContainerRef.current) return;

    const L = Leaflet;
    const map = L.map(mapContainerRef.current, { center: mapCenter, zoom: 18 });
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 80 }).addTo(map);
    L.polygon(eacPolygon, { color: "blue", fillColor: "#3f83f8", fillOpacity: 0.3 }).addTo(map);
  }, [Leaflet]);

  const computeActive = (user: LocationUpdate) => {
    if (user.lastSeen) {
      const lastSeenTime = new Date(user.lastSeen).getTime();
      return Date.now() - lastSeenTime < 2 * 60 * 1000;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  // Initialize Socket.IO and handle events
  useEffect(() => {
    if (!Leaflet) return;

    const socket = io("http://localhost:3000");
    socketRef.current = socket;

    const addToast = (message: string) => {
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    };

    socket.on("currentUsers", (existingUsers: Record<string, LocationUpdate>) => {
      const updatedUsers: Record<string, LocationUpdate> = {};
      Object.entries(existingUsers).forEach(([id, u]) => {
        updatedUsers[id] = { ...u, active: computeActive(u) };
      });
      setUsers(updatedUsers);
    });

    socket.on("userLocationUpdate", (data: Record<string, LocationUpdate>) => {
      setUsers((prev) => {
        const updated = { ...prev };
        Object.entries(data).forEach(([id, u]) => {
          updated[id] = { ...u, active: computeActive(u) };
        });
        return updated;
      });
    });

    socket.on("userEntered", ({ id }) => addToast(`User ${id} entered the building`));
    socket.on("userExited", ({ id }) => addToast(`User ${id} exited the building`));

    socket.on("userDisconnected", (id: string) => {
      if (markersRef.current[id] && leafletMapRef.current) {
        leafletMapRef.current.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
      setUsers((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [Leaflet]);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black font-sans">
      {/* Main Header */}
      <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-3 relative flex items-center">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 mx-auto">Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Logout
        </button>
      </header>

      {/* Main content: sidebar + map */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <ul className="space-y-2">
            {Object.entries(users).length > 0 ? (
              Object.entries(users).map(([schoolId, u]) => (
                <li key={schoolId} className="flex flex-col p-2 rounded bg-gray-100 dark:bg-gray-800 shadow-sm">
                  <span className="font-medium">{schoolId}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Lat: {u.lat?.toFixed(5) ?? "-"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Lon: {u.lon?.toFixed(5) ?? "-"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Last inside: {u.lastInside ? new Date(u.lastInside).toLocaleString() : "Never"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Last updated: {u.lastSeen ? new Date(u.lastSeen).toLocaleString() : "Never"}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Status: {u.active ? "Active ✅" : "Inactive ❌"}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-gray-500">No users connected</li>
            )}
          </ul>
        </aside>

        {/* Map */}
        <main className="flex-1 flex flex-col items-center justify-start py-6 px-4">
          <div ref={mapContainerRef} style={{ height: "80vh", width: "100%", borderRadius: 8 }} />
        </main>
      </div>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="bg-red-500 text-white px-4 py-2 rounded shadow-lg">
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
