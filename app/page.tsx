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

// Separate Sidebar Component
function UserSidebar({ 
  userId, 
  users, 
  isOpen, 
  onClose 
}: { 
  userId: string | null; 
  users: Record<string, LocationUpdate>; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const isUserActive = (lastSeen?: string) => {
    if (!lastSeen) return false;
    return new Date().getTime() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full w-80 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto z-50 transition-transform duration-300 ease-in-out lg:static lg:z-10 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'
        }`}
      >
        <div className="flex justify-between items-center mb-4 lg:hidden">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Your Information</h2>
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
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Your Information</h2>
        </div>
        
        <ul className="space-y-3">
          {userId && users[userId] ? (
            <li className="flex flex-col p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{userId}</span>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Lat:</span>
                  <span className="text-gray-700 dark:text-gray-300 font-mono">
                    {users[userId].lat?.toFixed(5) ?? "-"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Lon:</span>
                  <span className="text-gray-700 dark:text-gray-300 font-mono">
                    {users[userId].lon?.toFixed(5) ?? "-"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Accuracy:</span>
                  <span className="text-gray-700 dark:text-gray-300 font-mono">
                    {users[userId].accuracy?.toFixed(1) ?? "-"} m
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Last inside:</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right">
                    {users[userId].lastInside ? new Date(users[userId].lastInside).toLocaleTimeString() : "Never"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Last updated:</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right">
                    {users[userId].lastSeen ? new Date(users[userId].lastSeen).toLocaleTimeString() : "Never"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-500 dark:text-gray-400">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isUserActive(users[userId].lastSeen) 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                  }`}>
                    {isUserActive(users[userId].lastSeen) ? "Active" : "Idle"}
                  </span>
                </div>
              </div>
            </li>
          ) : (
            <li className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2 text-sm">No coordinates yet</p>
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const userMarkerRef = useRef<any>(null); // Reference for user's own marker
  const accuracyCircleRef = useRef<any>(null); // Reference for accuracy circle
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);

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

  // Update user marker on map
  const updateUserMarker = (lat: number, lon: number, accuracy: number) => {
    if (!Leaflet || !leafletMapRef.current) return;

    const L = Leaflet;
    
    // Remove existing user marker and accuracy circle
    if (userMarkerRef.current) {
      leafletMapRef.current.removeLayer(userMarkerRef.current);
    }
    if (accuracyCircleRef.current) {
      leafletMapRef.current.removeLayer(accuracyCircleRef.current);
    }

    // Create custom icon for user's location
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: `
        <div style="
          width: 20px;
          height: 20px;
          background: #2563eb;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    // Create accuracy circle
    const accuracyCircle = L.circle([lat, lon], {
      radius: accuracy,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
      dashArray: '5, 5'
    }).addTo(leafletMapRef.current);
    accuracyCircleRef.current = accuracyCircle;

    // Create user marker
    const userMarker = L.marker([lat, lon], { icon: userIcon })
      .addTo(leafletMapRef.current)
      .bindPopup(`
        <div style="text-align: center;">
          <strong>Your Location</strong><br>
          📍 ${userId || 'You'}<br>
          Accuracy: ${accuracy.toFixed(1)} m<br>
          <small>Lat: ${lat.toFixed(5)}<br>Lon: ${lon.toFixed(5)}</small>
        </div>
      `);

    userMarkerRef.current = userMarker;

    // Center map on user location if it's the first time
    if (!userLocation) {
      leafletMapRef.current.setView([lat, lon], 18);
    }

    setUserLocation({ lat, lon, accuracy });
  };

  // Socket.IO initialization
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

        // Don't create marker for current user (we have a special marker for that)
        if (id !== userId) {
          if (markersRef.current[id]) {
            markersRef.current[id].setLatLng([lat!, lon!]);
          } else {
            const marker = L.circleMarker([lat!, lon!], { 
              radius: 6,
              color: '#dc2626',
              fillColor: '#ef4444',
              fillOpacity: 0.8,
              weight: 2
            });
            marker.addTo(leafletMapRef.current);
            markersRef.current[id] = marker;
          }

          markersRef.current[id].bindPopup(
            `${id}<br>📍 ${inside ? "✅ Inside" : "❌ Outside"}<br>Accuracy: ${accuracy?.toFixed(1) ?? "-"} m`
          );
        }
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

  // Initialize Map and Geolocation
  useEffect(() => {
    if (!started || !Leaflet || !mapContainerRef.current) return;
    const L = Leaflet;
    const map = L.map(mapContainerRef.current, { 
      center: mapCenter, 
      zoom: 18,
      tap: false,
      dragging: true,
      scrollWheelZoom: true,
      zoomControl: true,
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

    L.control.zoom({
      position: 'topright'
    }).addTo(map);

    // Handle window resize
    const handleResize = () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    if (navigator.geolocation && userId) {
      const watchId = navigator.geolocation.watchPosition(
        ({ coords: { latitude, longitude, accuracy } }) => {
          if (!isNaN(latitude) && !isNaN(longitude)) {
            // Update user marker on map
            updateUserMarker(latitude, longitude, accuracy);
            
            // Send location to server
            socketRef.current?.emit("updateLocation", { 
              schoolId: userId, 
              lat: latitude, 
              lon: longitude, 
              accuracy 
            });
          }
        },
        (err) => {
          console.error("watchPosition error:", err);
          setStatusHtml("Location access denied or unavailable");
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 1000, 
          timeout: 10000 
        }
      );

      return () => {
        window.removeEventListener('resize', handleResize);
        navigator.geolocation.clearWatch(watchId);
        
        // Clean up markers
        if (userMarkerRef.current) {
          map.removeLayer(userMarkerRef.current);
        }
        if (accuracyCircleRef.current) {
          map.removeLayer(accuracyCircleRef.current);
        }
      };
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
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
      // Clean up markers
      if (userMarkerRef.current) {
        leafletMapRef.current.removeLayer(userMarkerRef.current);
      }
      if (accuracyCircleRef.current) {
        leafletMapRef.current.removeLayer(accuracyCircleRef.current);
      }
      
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
    setSidebarOpen(false);
    setDesktopSidebarVisible(false);
    setUserLocation(null);
  };

  const toggleMobileSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleDesktopSidebar = () => {
    setDesktopSidebarVisible(!desktopSidebarVisible);
  };

  const closeMobileSidebar = () => {
    setSidebarOpen(false);
  };

  // Close mobile sidebar when window is resized to larger size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black font-sans">
      {/* Main Header - Highest z-index */}
      <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-3 sticky top-0 z-50 flex items-center">
        {/* Hamburger Button for mobile */}
        {started && (
          <div className="w-10 lg:hidden">
            <button
              onClick={toggleMobileSidebar}
              className="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Title - centered */}
        <div className="flex-1 flex justify-center">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 text-center">
            User Dashboard
          </h1>
        </div>

        {/* Menu Button - right aligned */}
        {started && (
          <div className="w-10 flex justify-end">
            <div className="relative">
              <button
                className="flex flex-col justify-between w-6 h-6 p-1 focus:outline-none hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Open menu"
              >
                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-60 py-1">
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-1 relative">
        {/* Sidebar - Only show when started */}
        {started && (
          <UserSidebar 
            userId={userId} 
            users={users} 
            isOpen={sidebarOpen || desktopSidebarVisible} 
            onClose={closeMobileSidebar} 
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col w-full">
          {/* Info Bar for started state */}
          {started && (
            <>
              {/* Mobile Info Bar */}
              <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 z-30 relative">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {userId ? `Logged in as: ${userId}` : 'Not logged in'}
                  </span>
                  <button
                    onClick={toggleMobileSidebar}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    {sidebarOpen ? 'Hide info' : 'Show info'}
                  </button>
                </div>
              </div>

              {/* Desktop Toggle Button */}
              <div className="hidden lg:flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 justify-between items-center z-30 relative">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {userId ? `Logged in as: ${userId}` : 'Not logged in'}
                </span>
                <button
                  onClick={toggleDesktopSidebar}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                >
                  {desktopSidebarVisible ? 'Hide info' : 'Show info'}
                </button>
              </div>
            </>
          )}

          {/* Content Area */}
          <div className="flex-1 p-2 sm:p-4 md:p-6 z-0 relative">
            {!started ? (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md mx-auto">
                <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-gray-200">
                  {isRegister ? "Register New User" : "Enter School ID & Password"}
                </h3>
                <div className="flex flex-col gap-3">
                  <input 
                    value={schoolId} 
                    onChange={(e) => setSchoolId(e.target.value)} 
                    placeholder="School ID" 
                    className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg w-full bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Password" 
                    type="password" 
                    className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg w-full bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button 
                    onClick={isRegister ? handleRegister : handleStart} 
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg mt-2 transition-colors font-medium"
                  >
                    {isRegister ? "Register" : "Start"}
                  </button>
                  <button 
                    className="text-sm text-blue-500 hover:underline mt-2 transition-colors" 
                    onClick={() => setIsRegister(!isRegister)}
                  >
                    {isRegister ? "Go to Login" : "Register New User"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">Uses browser geolocation.</p>
              </div>
            ) : (
              <div className="flex-1 w-full h-full">
                <div 
                  ref={mapContainerRef} 
                  className="w-full h-full min-h-[400px] sm:min-h-[500px] rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
                />
                <div 
                  className="mt-3 px-3 py-2 rounded text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300" 
                  dangerouslySetInnerHTML={{ __html: statusHtml }} 
                />
                {userLocation && (
                  <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    Your location: {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)} 
                    (Accuracy: {userLocation.accuracy.toFixed(1)}m)
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}