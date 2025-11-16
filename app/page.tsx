// app/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
import { useAuth } from '@/lib/firebase/AuthContext';
import { auth } from '@/lib/firebase/client-config';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

type LocationUpdate = {
    id: string;
    lat?: number;
    lon?: number;
    accuracy?: number;
    lastInside?: string;
    lastSeen?: string;
};

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
            <div
                className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 lg:hidden ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

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
    const userMarkerRef = useRef<any>(null);
    const accuracyCircleRef = useRef<any>(null);
    const socketRef = useRef<Socket | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const menuButtonRef = useRef<HTMLButtonElement | null>(null);

    const { user, loading, logout: firebaseLogout } = useAuth();

    const started = !!user && !loading;
    const userId = user?.uid ?? null;

    const [schoolId, setSchoolId] = useState("");
    const [password, setPassword] = useState("");
    const [statusHtml, setStatusHtml] = useState("Connecting...");
    const [users, setUsers] = useState<Record<string, LocationUpdate>>({});
    const [Leaflet, setLeaflet] = useState<any>(null);
    const [isRegister, setIsRegister] = useState(false);
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

    useEffect(() => {
        if (typeof window === "undefined") return;
        import("leaflet").then((L) => setLeaflet(L));
    }, []);

    const updateUserMarker = useCallback((lat: number, lon: number, accuracy: number) => {
        if (!Leaflet || !leafletMapRef.current) return;

        const L = Leaflet;

        if (userMarkerRef.current) {
            try { leafletMapRef.current.removeLayer(userMarkerRef.current); } catch { }
            userMarkerRef.current = null;
        }
        if (accuracyCircleRef.current) {
            try { leafletMapRef.current.removeLayer(accuracyCircleRef.current); } catch { }
            accuracyCircleRef.current = null;
        }

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

        const accuracyCircle = L.circle([lat, lon], {
            radius: accuracy,
            color: '#2563eb',
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            weight: 1,
            dashArray: '5, 5'
        }).addTo(leafletMapRef.current);
        accuracyCircleRef.current = accuracyCircle;

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

        if (!userLocation) {
            leafletMapRef.current.setView([lat, lon], 18);
        }

        setUserLocation({ lat, lon, accuracy });
    }, [Leaflet, userId, userLocation]);

    useEffect(() => {
        if (!started || !userId || !user) {
            if (socketRef.current) {
                try { socketRef.current.disconnect(); } catch { }
                socketRef.current = null;
                setStatusHtml("Disconnected");
            }
            return;
        }

        let socket: Socket | null = null;

        const initSocket = async () => {
            try {
                setStatusHtml("Connecting to server...");
                const idToken = await user.getIdToken(true);
                
                socket = io(SOCKET_URL, {
                    auth: { token: idToken }
                });
                socketRef.current = socket;

                socket.on("connect", () => {
                    setStatusHtml("Connected and authenticated");
                    console.log("Socket connected successfully");
                });

                socket.on("connect_error", (error) => {
                    console.error("Connection error:", error);
                    setStatusHtml(`Connection failed: ${error.message}`);
                });

                socket.on("disconnect", (reason) => {
                    console.log("Socket disconnected:", reason);
                    setStatusHtml("Disconnected from server");
                });

                socket.on("error", (error) => {
                    console.error("Socket error:", error);
                    setStatusHtml(`Error: ${error}`);
                });

                socket.on("currentUsers", (existingUsers: Record<string, LocationUpdate>) => {
                    setUsers(existingUsers);
                });

                // CRITICAL: Listen for locationConfirmed to update sidebar
                socket.on("locationConfirmed", (data: any) => {
                    console.log("Location confirmed:", data);
                    setUsers((prev) => ({
                        ...prev,
                        [data.id]: data
                    }));
                });

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

                            try {
                                markersRef.current[id].bindPopup(
                                    `${id}<br>📍 ${inside ? "✅ Inside" : "❌ Outside"}<br>Accuracy: ${accuracy?.toFixed(1) ?? "-"} m`
                                );
                            } catch { }
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
                        try { leafletMapRef.current.removeLayer(marker); } catch { }
                        delete markersRef.current[id];
                    }
                    setUsers((prev) => {
                        const copy = { ...prev };
                        delete copy[id];
                        return copy;
                    });
                });

                const heartbeat = setInterval(() => {
                    if (socket?.connected) {
                        socket.emit("heartbeat", {});
                    }
                }, 30000);

                return () => {
                    clearInterval(heartbeat);
                };
            } catch (error) {
                console.error("Error initializing socket:", error);
                setStatusHtml("Authentication error");
                handleLogout();
            }
        };

        initSocket();

        return () => {
            if (socket) {
                try { socket.off(); } catch { }
                try { socket.disconnect(); } catch { }
            }
            socketRef.current = null;
        };
    }, [started, user, Leaflet, userId]);

    useEffect(() => {
        if (!started || !Leaflet || !mapContainerRef.current) {
            if (leafletMapRef.current) {
                try { leafletMapRef.current.remove(); } catch { }
                leafletMapRef.current = null;
            }
            return;
        }

        const L = Leaflet;

        if (!leafletMapRef.current) {
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
        }

        const handleResize = () => {
            setTimeout(() => {
                leafletMapRef.current?.invalidateSize();
            }, 100);
        };
        window.addEventListener('resize', handleResize);

        if (navigator.geolocation && userId) {
            try {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    ({ coords: { latitude, longitude, accuracy } }) => {
                        if (!isNaN(latitude) && !isNaN(longitude)) {
                            updateUserMarker(latitude, longitude, accuracy);

                            socketRef.current?.emit("locationUpdate", {
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
            } catch (e) {
                console.error("geolocation watch error:", e);
            }
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (watchIdRef.current != null) {
                try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { }
                watchIdRef.current = null;
            }

            try {
                if (userMarkerRef.current) {
                    leafletMapRef.current?.removeLayer(userMarkerRef.current);
                    userMarkerRef.current = null;
                }
                if (accuracyCircleRef.current) {
                    leafletMapRef.current?.removeLayer(accuracyCircleRef.current);
                    accuracyCircleRef.current = null;
                }
                Object.values(markersRef.current).forEach((m: any) => {
                    if (leafletMapRef.current && m) {
                        try { leafletMapRef.current.removeLayer(m); } catch { }
                    }
                });
                markersRef.current = {};
            } catch { }
        };
    }, [started, Leaflet, userId, updateUserMarker]);

    const handleStart = async () => {
        const email = schoolId.trim() + "@school.edu";
        const pw = password.trim();
        if (!schoolId || !pw) return alert("Enter School ID and Password");

        try {
            await signInWithEmailAndPassword(auth, email, pw);
            setStatusHtml("Login successful!");
        } catch (error: any) {
            alert(`Login Failed: ${error.message}`);
        }
    };

    const handleRegister = async () => {
        const email = schoolId.trim() + "@school.edu";
        const pw = password.trim();
        if (!schoolId || !pw) return alert("Enter School ID and Password");

        try {
            await createUserWithEmailAndPassword(auth, email, pw);
            alert("Registration successful!");
            setIsRegister(false);
        } catch (error: any) {
            alert(`Registration Failed: ${error.message}`);
        }
    };

    const handleLogout = () => {
        firebaseLogout();

        if (watchIdRef.current != null) {
            try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { }
            watchIdRef.current = null;
        }

        setSchoolId("");
        setPassword("");
        setStatusHtml("Disconnected");
        setMenuOpen(false);
        setSidebarOpen(false);
        setDesktopSidebarVisible(false);
        setUserLocation(null);
    };

    const toggleMobileSidebar = () => setSidebarOpen((s) => !s);
    const toggleDesktopSidebar = () => setDesktopSidebarVisible((s) => !s);
    const closeMobileSidebar = () => setSidebarOpen(false);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) setSidebarOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleDocumentClick = (ev: MouseEvent) => {
            if (!menuOpen) return;

            const target = ev.target as Node | null;
            if (menuRef.current && menuRef.current.contains(target)) return;
            if (menuButtonRef.current && menuButtonRef.current.contains(target)) return;

            setMenuOpen(false);
        };

        document.addEventListener('mousedown', handleDocumentClick);
        return () => document.removeEventListener('mousedown', handleDocumentClick);
    }, [menuOpen]);

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black font-sans">
            <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-3 sticky top-0 z-50 flex items-center">
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

                <div className="flex-1 flex justify-center">
                    <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 text-center">
                        User Dashboard
                    </h1>
                </div>

                {started && (
                    <div className="w-10 flex justify-end">
                        <div className="relative" ref={menuRef}>
                            <button
                                ref={menuButtonRef}
                                className="flex flex-col justify-between w-6 h-6 p-1 focus:outline-none hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                onClick={() => setMenuOpen((m) => !m)}
                                aria-label="Open menu"
                            >
                                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
                                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
                                <span className="block h-0.5 bg-gray-800 dark:bg-gray-200 rounded"></span>
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-60 py-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleLogout();
                                        }}
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
                {started && (
                    <UserSidebar
                        userId={userId}
                        users={users}
                        isOpen={sidebarOpen || desktopSidebarVisible}
                        onClose={closeMobileSidebar}
                    />
                )}

                <main className="flex-1 flex flex-col w-full">
                    {started && (
                        <>
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

                    <div className="flex-1 p-2 sm:p-4 md:p-6 z-0 relative">
                        {!started ? (
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md mx-auto">
                                <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-gray-200">
                                    {isRegister ? "Register New User" : "Enter Email & Password"}
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
                                        {isRegister ? "Register" : "Start (Login)"}
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