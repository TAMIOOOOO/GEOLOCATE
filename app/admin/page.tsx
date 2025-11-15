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

// Separate Sidebar Component
function Sidebar({ users, isOpen, onClose }: {
  users: Record<string, LocationUpdate>;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-80 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700 z-500 transition-transform duration-300 ease-in-out lg:static lg:z-10 lg:translate-x-0 lg:h-screen ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'
          }`}
      >
        <div className="flex justify-between items-center mb-4 lg:hidden">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Users</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="hidden lg:block mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Users</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {Object.keys(users).length} user{Object.keys(users).length !== 1 ? 's' : ''} connected
          </p>
        </div>

        <ul className="space-y-3">
          {Object.entries(users).length > 0 ? (
            Object.entries(users).map(([schoolId, u]) => (
              <li
                key={schoolId}
                className="flex flex-col p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{schoolId}</span>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Lat:</span>
                    <span className="text-gray-700 dark:text-gray-300 font-mono">
                      {u.lat?.toFixed(5) ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Lon:</span>
                    <span className="text-gray-700 dark:text-gray-300 font-mono">
                      {u.lon?.toFixed(5) ?? "-"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Last inside:</span>
                    <span className="text-gray-700 dark:text-gray-300 text-right">
                      {u.lastInside ? new Date(u.lastInside).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Last updated:</span>
                    <span className="text-gray-700 dark:text-gray-300 text-right">
                      {u.lastSeen ? new Date(u.lastSeen).toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-gray-500 dark:text-gray-400">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              <p className="mt-2 text-sm">No users connected</p>
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

export default function Admin() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const socketRef = useRef<Socket | null>(null);

  const [users, setUsers] = useState<Record<string, LocationUpdate>>({});
  const [Leaflet, setLeaflet] = useState<any>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const mapInitializedRef = useRef(false);

  useEffect(() => {
    if (!Leaflet || !mapContainerRef.current || mapInitializedRef.current) return;

    const L = Leaflet;
    mapInitializedRef.current = true; // Mark as initialized

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: 18,
      tap: false,
      dragging: true,
      scrollWheelZoom: true,
      zoomControl: false, // ← This disables default
      doubleClickZoom: true
    });
    leafletMapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 80,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.polygon(eacPolygon, {
      color: "blue",
      fillColor: "#3f83f8",
      fillOpacity: 0.3
    }).addTo(map);

    // Add ONLY ONE zoom control
    L.control.zoom({
      position: 'topright'
    }).addTo(map);

    const handleResize = () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInitializedRef.current = false; // Reset on cleanup
    };
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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Close sidebar on desktop when window is resized to larger size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-3 sticky top-0 z-50 flex justify-between items-center">
        {/* Left section - Hamburger Button (visible on mobile/tablet, hidden on desktop) */}
        <div className="flex-shrink-0 lg:invisible"> {/* Changed from lg:hidden to lg:invisible */}

        </div>

        {/* Center section - Title */}
        <div className="flex-1 flex justify-center">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 text-center">
            Admin Dashboard
          </h1>
        </div>

        {/* Right section - Logout Button */}
        <div className="flex-shrink-0">
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm md:text-base"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main content: sidebar + map */}
      <div className="flex flex-1 relative">
        {/* Sidebar */}
        <Sidebar users={users} isOpen={sidebarOpen} onClose={closeSidebar} />

        {/* Map Container */}
        <main className="flex-1 flex flex-col w-full">
          {/* Mobile Info Bar */}
          <div className=" bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {Object.keys(users).length} user{Object.keys(users).length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={toggleSidebar}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                {sidebarOpen ? 'Hide users' : 'Show users'}
              </button>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 p-2 sm:p-4 md:p-6">
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[400px] sm:min-h-[500px] rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
            />
          </div>
        </main>
      </div>

      {/* Toasts - Responsive positioning */}
      <div className="fixed top-16 right-2 left-2 sm:right-4 sm:left-auto z-0 space-y-2 max-w-sm mx-auto sm:mx-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 animate-in slide-in-from-right-8"
          >
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{t.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}