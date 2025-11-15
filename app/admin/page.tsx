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

type Notification = {
  id: string;
  type: 'enter' | 'exit' | 'info' | 'user_connected' | 'user_disconnected';
  message: string;
  timestamp: string;
  userId?: string;
  read: boolean;
};

// Notification Center Component
function NotificationCenter({ 
  isOpen, 
  onClose, 
  notifications, 
  onMarkAsRead, 
  onClearAll 
}: {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}) {
  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'enter':
        return '🟢';
      case 'exit':
        return '🔴';
      case 'user_connected':
        return '🔵';
      case 'user_disconnected':
        return '⚫';
      default:
        return 'ℹ️';
    }
  };

  const filterNotifications = (type: string) => {
    if (type === 'all') return notifications;
    return notifications.filter(n => n.type === type);
  };

  const [filter, setFilter] = useState<'all' | 'enter' | 'exit' | 'user_connected' | 'user_disconnected'>('all');
  const filteredNotifications = filterNotifications(filter);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Notification Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notifications</h2>
              {unreadCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={onClearAll}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Clear All
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(['all', 'enter', 'exit', 'user_connected', 'user_disconnected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  filter === tab
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto z-10000">
            {filteredNotifications.length > 0 ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 cursor-pointer transition-colors ${
                      notification.read 
                        ? 'bg-white dark:bg-gray-900' 
                        : 'bg-blue-50 dark:bg-blue-900/10'
                    } hover:bg-gray-50 dark:hover:bg-gray-800`}
                    onClick={() => onMarkAsRead(notification.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${
                          notification.read 
                            ? 'text-gray-600 dark:text-gray-400' 
                            : 'text-gray-900 dark:text-gray-100 font-medium'
                        }`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                        {notification.userId && (
                          <span className="inline-block mt-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                            User: {notification.userId}
                          </span>
                        )}
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-5 5v-5zM8.5 14.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                </svg>
                <p className="text-lg">No notifications</p>
                <p className="text-sm mt-1">Notifications will appear here</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 z-1000">
            <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
              <span>Total: {notifications.length}</span>
              <span>Unread: {unreadCount}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
        className={`fixed left-0 top-0 h-100% w-80 bg-white dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-700 z-5000 transition-transform duration-300 ease-in-out lg:static lg:z-10 lg:translate-x-0 lg:h-screen ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

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

  // Load notifications from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("adminNotifications");
      if (saved) {
        setNotifications(JSON.parse(saved));
      }
    }
  }, []);

  // Save notifications to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && notifications.length > 0) {
      localStorage.setItem("adminNotifications", JSON.stringify(notifications));
    }
  }, [notifications]);

  // Initialize Leaflet Map
  const mapInitializedRef = useRef(false);

  useEffect(() => {
    if (!Leaflet || !mapContainerRef.current || mapInitializedRef.current) return;

    const L = Leaflet;
    mapInitializedRef.current = true;

    const map = L.map(mapContainerRef.current, {
      center: mapCenter,
      zoom: 18,
      tap: false,
      dragging: true,
      scrollWheelZoom: true,
      zoomControl: false,
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
      mapInitializedRef.current = false;
    };
  }, [Leaflet]);

  const computeActive = (user: LocationUpdate) => {
    if (user.lastSeen) {
      const lastSeenTime = new Date(user.lastSeen).getTime();
      return Date.now() - lastSeenTime < 2 * 60 * 1000;
    }
    return false;
  };

  // Add notification
  const addNotification = (type: Notification['type'], message: string, userId?: string) => {
    const newNotification: Notification = {
      id: Date.now().toString(),
      type,
      message,
      timestamp: new Date().toISOString(),
      userId,
      read: false
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 199)]); // Keep last 200
  };

  // Mark notification as read
  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  // Clear all notifications
  const clearAllNotifications = () => {
    setNotifications([]);
    localStorage.removeItem("adminNotifications");
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.href = "/";
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleNotificationCenter = () => {
    setNotificationCenterOpen(!notificationCenterOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Close sidebar on desktop when window is resized to larger size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update user markers on map
  useEffect(() => {
    if (!Leaflet || !leafletMapRef.current) return;

    const L = Leaflet;
    
    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => {
      leafletMapRef.current.removeLayer(marker);
    });
    markersRef.current = {};

    // Create markers for all users
    Object.entries(users).forEach(([userId, user]) => {
      if (user.lat && user.lon) {
        const marker = L.circleMarker([user.lat, user.lon], {
          radius: 6,
          color: user.active ? '#22c55e' : '#ef4444',
          fillColor: user.active ? '#16a34a' : '#dc2626',
          fillOpacity: 0.8,
          weight: 2
        }).addTo(leafletMapRef.current);

        marker.bindPopup(`
          <div class="text-sm">
            <strong>${userId}</strong><br>
            📍 ${user.lastInside ? "Inside" : "Outside"}<br>
            Status: ${user.active ? "Active" : "Inactive"}<br>
            <small>Updated: ${user.lastSeen ? new Date(user.lastSeen).toLocaleTimeString() : "Never"}</small>
          </div>
        `);

        markersRef.current[userId] = marker;
      }
    });
  }, [users, Leaflet]);

  // Initialize Socket.IO and handle events
  useEffect(() => {
    if (!Leaflet) return;

    const socket = io("http://localhost:3000");
    socketRef.current = socket;

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

    socket.on("userEntered", ({ id, time }) => {
      addNotification('enter', `User ${id} entered the building`, id);
    });

    socket.on("userExited", ({ id, time }) => {
      addNotification('exit', `User ${id} left the building`, id);
    });

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
      addNotification('user_disconnected', `User ${id} disconnected`, id);
    });

    // Listen for new user connections
    socket.on("userConnected", (data: any) => {
      if (data.id) {
        addNotification('user_connected', `User ${data.id} connected`, data.id);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [Leaflet]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black font-sans">
      {/* Main Header */}
      <header className="w-full bg-white dark:bg-gray-900 shadow-md px-4 py-3 sticky top-0 z-50 flex justify-between items-center">
        {/* Left section - Hamburger Button */}
        <div className="flex-shrink-0 lg:invisible">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Center section - Title */}
        <div className="flex-1 flex justify-center">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 text-center">
            Admin Dashboard
          </h1>
        </div>

        {/* Right section - Buttons */}
        <div className="flex-shrink-0 flex items-center space-x-2">
          {/* Notifications Button */}
          <button
            onClick={toggleNotificationCenter}
            className="relative p-2 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Notifications"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM8.5 14.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Logout Button */}
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
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {Object.keys(users).length} user{Object.keys(users).length !== 1 ? 's' : ''}
                {unreadCount > 0 && (
                  <span className="ml-2 text-red-500">
                    • {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                  </span>
                )}
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

      {/* Notification Center */}
      <NotificationCenter
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
        notifications={notifications}
        onMarkAsRead={markNotificationAsRead}
        onClearAll={clearAllNotifications}
      />
    </div>
  );
}