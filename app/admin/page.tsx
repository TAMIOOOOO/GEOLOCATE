// app/admin/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/navigation';
import { ref, onValue, off } from 'firebase/database';
import { database } from '@/lib/firebase/client-config';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://geolocate-g7gh.vercel.app/';

type LocationUpdate = {
  lat?: number;
  lon?: number;
  accuracy?: number;
  lastInside?: string | null;
  lastSeen?: string;
  email?: string;
};

type User = {
  uid: string;
  email?: string;
  displayName?: string;
  locationData?: LocationUpdate;
};

type Notification = {
  id: string;
  type: 'enter' | 'exit' | 'info' | 'user_connected' | 'user_disconnected';
  message: string;
  timestamp: string;
  userId?: string;
  read: boolean;
};

export default function Admin() {
  const router = useRouter();
  const { user, loading: authLoading, logout: firebaseLogout } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const started = !!user && !authLoading;
  const userId = user?.uid ?? null;

  const [allUsers, setAllUsers] = useState<Record<string, User>>({});
  const [liveLocationData, setLiveLocationData] = useState<Record<string, LocationUpdate>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'idle'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'lastSeen' | 'status'>('name');
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch all users from Realtime Database
  const fetchAllUsers = useCallback(() => {
    if (!started) return;

    setLoading(true);
    const usersRef = ref(database, 'users');

    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        const usersData: Record<string, User> = {};
        Object.entries(data).forEach(([uid, userData]: [string, any]) => {
          usersData[uid] = {
            uid,
            email: userData.email || uid,
            displayName: userData.displayName || userData.email || uid,
            locationData: {
              lat: userData.lat,
              lon: userData.lon,
              accuracy: userData.accuracy,
              lastInside: userData.lastInside,
              lastSeen: userData.lastSeen,
              email: userData.email
            }
          };
        });
        setAllUsers(usersData);
      } else {
        setAllUsers({});
      }

      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setConnectionError(`Database error: ${error.message}`);
      setLoading(false);
    });

    return () => off(usersRef, 'value', unsubscribe);

  }, [started]);

  const computeActive = useCallback((locationData: LocationUpdate) => {
    if (locationData?.lastSeen) {
      const lastSeenTime = new Date(locationData.lastSeen).getTime();
      return Date.now() - lastSeenTime < 2 * 60 * 1000;
    }
    return false;
  }, []);

  const addNotification = useCallback((type: Notification['type'], message: string, userId?: string) => {
    const newNotification: Notification = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date().toISOString(),
      userId,
      read: false
    };
    setNotifications(prev => [newNotification, ...prev.slice(0, 99)]);
  }, []);

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notification =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem("adminNotifications");
    }
  };

  const handleLogout = async () => {
    try {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      await firebaseLogout();
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
      router.push("/");
    }
  };

  // Authentication check
  useEffect(() => {
    if (authLoading) return;

    const checkAdminStatus = async () => {
      if (!user) {
        router.push("/");
        return;
      }

      try {
        const idTokenResult = await user.getIdTokenResult(true);
        const isAdminClaim = idTokenResult.claims.admin === true; // <-- Use a new var

        if (!isAdminClaim) {
          alert('Access Denied: You must be an administrator');
          router.push("/");
        } else {
          setIsAdmin(true); // <-- SET THE STATE HERE
        }
      } catch (error) {
        console.error("Error checking admin claims:", error);
        router.push("/");
      }
    };

    checkAdminStatus();
  }, [user, authLoading, router]);

  // Fetch users from Realtime Database
  useEffect(() => {
    if (!isAdmin) return; // <-- CHANGE THIS LINE
    return fetchAllUsers();
  }, [isAdmin, fetchAllUsers]); // <-- AND CHANGE THIS LINE (the dependency array)

  // Load notifications from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("adminNotifications");
      if (saved) {
        try {
          setNotifications(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to load notifications:", e);
        }
      }
    }
  }, []);

  // Save notifications to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && notifications.length > 0) {
      localStorage.setItem("adminNotifications", JSON.stringify(notifications));
    }
  }, [notifications]);

  // Socket.IO connection for live updates
  useEffect(() => {
    if (!started || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    if (socketRef.current?.connected) return;

    let socket: Socket | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const initSocket = async () => {
      try {
        const idToken = await user.getIdToken(true);

        socket = io(SOCKET_URL, {
          auth: { token: idToken },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
          timeout: 10000,
          autoConnect: true,
          forceNew: true
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          console.log("✅ Admin socket connected:", socket?.id);
          setSocketConnected(true);
          setConnectionError(null);
          reconnectAttempts = 0;
        });

        socket.on("connect_error", (error) => {
          console.error("❌ Connection error:", error.message);
          setSocketConnected(false);
          reconnectAttempts++;

          if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            setConnectionError(`Failed to connect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
          } else {
            setConnectionError(`Connection failed. Retrying... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          }
        });

        socket.on("disconnect", (reason) => {
          console.log("⚠️  Socket disconnected:", reason);
          setSocketConnected(false);

          if (reason === "io server disconnect") {
            socket?.connect();
          }
        });

        socket.on("error", (error) => {
          console.error("Socket error:", error);
          setConnectionError(`Error: ${error}`);
        });

        // Receive current users
        socket.on("currentUsers", (existingUsers: Record<string, LocationUpdate>) => {
          console.log("📊 Received current users:", Object.keys(existingUsers).length);
          const validUsers: Record<string, LocationUpdate> = {};
          Object.entries(existingUsers).forEach(([id, data]) => {
            if (data && typeof data === 'object') {
              validUsers[id] = { ...data };
            }
          });
          setLiveLocationData(validUsers);
        });

        // User location update
        socket.on("userLocationUpdate", (data: Record<string, LocationUpdate>) => {
          console.log("📍 Location update:", Object.keys(data));
          setLiveLocationData((prev) => ({ ...prev, ...data }));
        });

        // User entered geofence
        socket.on("userEntered", ({ id, time }: { id: string, time: string }) => {
          console.log("🟢 User entered:", id);
          addNotification('enter', `User ${id} entered the building`, id);
        });

        // User exited geofence
        socket.on("userExited", ({ id, time }: { id: string, time: string }) => {
          console.log("🔴 User exited:", id);
          addNotification('exit', `User ${id} left the building`, id);
        });

        // User disconnected
        socket.on("userDisconnected", (id: string) => {
          console.log("⚫ User disconnected:", id);
          setLiveLocationData((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
          addNotification('user_disconnected', `User ${id} disconnected`, id);
        });

        // User connected
        socket.on("userConnected", (data: { id: string }) => {
          console.log("🔵 User connected:", data.id);
          if (data.id) {
            addNotification('user_connected', `User ${data.id} connected`, data.id);
          }
        });

      } catch (error) {
        console.error("Error initializing socket:", error);
        setConnectionError("Failed to initialize connection");
      }
    };

    initSocket();

    return () => {
      if (socket) {
        socket.off();
        socket.disconnect();
      }
      socketRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user, started, addNotification]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuOpen &&
        menuRef.current &&
        menuButtonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !menuButtonRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  if (authLoading || !user || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700 dark:text-gray-300">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  // Merge database users with live location data
  const mergedUsers = Object.entries(allUsers).map(([uid, userData]) => {
    const locationData = liveLocationData[uid] || userData.locationData || {};
    const isActive = computeActive(locationData);

    return {
      ...userData,
      locationData: {
        ...locationData,
        active: isActive
      }
    };
  });

  const filteredUsers = mergedUsers
    .filter((user) => {
      const matchesSearch =
        user.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && user.locationData?.active) ||
        (filterStatus === 'idle' && !user.locationData?.active);

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return (a.displayName || a.email || a.uid).localeCompare(b.displayName || b.email || b.uid);
      } else if (sortBy === 'lastSeen') {
        const timeA = a.locationData?.lastSeen ? new Date(a.locationData.lastSeen).getTime() : 0;
        const timeB = b.locationData?.lastSeen ? new Date(b.locationData.lastSeen).getTime() : 0;
        return timeB - timeA;
      } else if (sortBy === 'status') {
        return (b.locationData?.active ? 1 : 0) - (a.locationData?.active ? 1 : 0);
      }
      return 0;
    });

  const activeUsersCount = mergedUsers.filter(u => u.locationData?.active).length;
  const usersInBuildingCount = mergedUsers.filter(u => u.locationData?.lastInside).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'enter': return '🟢';
      case 'exit': return '🔴';
      case 'user_connected': return '🔵';
      case 'user_disconnected': return '⚫';
      default: return 'ℹ️';
    }
  };

  const getUserDisplayName = (user: User) => {
    return user.displayName || user.email || user.uid;
  };

  const getUserInitials = (user: User) => {
    const name = getUserDisplayName(user);
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Real-time User Monitoring</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Connection Status */}
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg ${socketConnected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                }`}>
                <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}></div>
                <span className="text-xs font-medium">{socketConnected ? 'Live' : 'Offline'}</span>
              </div>

              {/* Notifications */}
              <button
                onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
                className="relative p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Refresh Button */}
              <button
                onClick={fetchAllUsers}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>

              {/* Menu */}
              <div className="relative" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-red-600 dark:text-red-400"
                    >
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Logout</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connection Error Banner */}
          {connectionError && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm text-yellow-800 dark:text-yellow-300">{connectionError}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{mergedUsers.length}</p>
              </div>
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Users</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{activeUsersCount}</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">In Building</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">{usersInBuildingCount}</p>
              </div>
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg">
                <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="idle">Idle Only</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="name">Sort by Name</option>
                <option value="lastSeen">Sort by Last Seen</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Accuracy</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Last Inside</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {getUserInitials(user)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{getUserDisplayName(user)}</div>
                            {user.email && user.email !== getUserDisplayName(user) && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${user.locationData?.active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                          {user.locationData?.active ? '● Active' : '○ Idle'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {user.locationData?.lat && user.locationData?.lon ? (
                          <div className="font-mono text-xs">
                            <div>{user.locationData.lat.toFixed(5)}, {user.locationData.lon.toFixed(5)}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">No data</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {user.locationData?.accuracy ? (
                          <span className="font-mono">{user.locationData.accuracy.toFixed(1)}m</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {user.locationData?.lastInside ? (
                          <div className="flex items-center space-x-2">
                            <span className="text-green-500">📍</span>
                            <span>{new Date(user.locationData.lastInside).toLocaleString()}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Never</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {user.locationData?.lastSeen ? (
                          new Date(user.locationData.lastSeen).toLocaleString()
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Never</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No users found</p>
                        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Notification Panel */}
      {notificationPanelOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setNotificationPanelOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notifications</h2>
                <button
                  onClick={() => setNotificationPanelOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear all ({unreadCount} unread)
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => markNotificationAsRead(notification.id)}
                    className={`p-4 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors ${notification.read
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20'
                      }`}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-2xl">{getNotificationIcon(notification.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${notification.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white font-medium'}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1"></div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-lg font-medium">No notifications</p>
                  <p className="text-sm mt-1">Notifications will appear here</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                <span>Total: {notifications.length}</span>
                <span>Unread: {unreadCount}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}