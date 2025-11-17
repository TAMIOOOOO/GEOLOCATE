// server/server.js - PRODUCTION READY
"use strict";

require('dotenv').config({ path: '.env.local' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const turf = require('@turf/turf');
const admin = require('firebase-admin');
require('dotenv').config();


// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3001";
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// Validate required environment variables
const requiredEnvVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_DATABASE_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    process.exit(1);
}

// ============================================
// FIREBASE ADMIN INITIALIZATION
// ============================================
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
    private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID || "",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || ""
};

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    process.exit(1);
}

const db = admin.database();

// ============================================
// EXPRESS APP SETUP
// ============================================
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

// Request logging middleware (production-safe)
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============================================
// IN-MEMORY STATE
// ============================================
const users = {}; // { UID: { lat, lon, accuracy, lastInside, lastSeen, socketId } }
const adminSockets = new Set(); // Track admin socket IDs

// Geofence polygon (can be updated via API)
let eacPolygon = [
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

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (!decodedToken || !decodedToken.uid) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.admin !== true) {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
};

// ============================================
// EXPRESS ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        connectedUsers: Object.keys(users).length,
        activeAdmins: adminSockets.size,
        uptime: process.uptime()
    });
});

// Get geofence polygon
app.get('/api/eac-polygon', (req, res) => {
    res.json({ polygon: eacPolygon });
});

// Update geofence polygon (admin only)
app.post('/api/eac-polygon', authenticateToken, requireAdmin, (req, res) => {
    const { polygon } = req.body;

    if (!Array.isArray(polygon) || polygon.length < 4) {
        return res.status(400).json({ error: 'Invalid polygon data' });
    }

    eacPolygon = polygon;
    console.log(`✏️  Admin ${req.user.uid} updated geofence polygon`);

    // Notify all connected clients
    io.emit('polygonUpdated', { polygon: eacPolygon });

    res.json({ success: true, message: 'Polygon updated' });
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('users').once('value');
        const data = snapshot.val() || {};

        res.json({ users: data });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get events log (admin only)
app.get('/api/events', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type, limit = 100 } = req.query;

        let eventsRef = db.ref('events');
        if (type === 'entries' || type === 'exits') {
            eventsRef = eventsRef.child(type);
        }

        const snapshot = await eventsRef.limitToLast(parseInt(limit)).once('value');
        const data = snapshot.val() || {};

        res.json({ events: data });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : err.message });
});

// ============================================
// SOCKET.IO SETUP
// ============================================
const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// Socket authentication middleware
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.error('❌ Socket connection without token');
        return next(new Error('Authentication required'));
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (!decodedToken || !decodedToken.uid) {
            return next(new Error('Invalid token'));
        }

        socket.data.uid = decodedToken.uid;
        socket.data.isAdmin = decodedToken.admin === true;
        socket.data.email = decodedToken.email || decodedToken.uid;

        next();
    } catch (error) {
        console.error('Socket auth error:', error.message);
        return next(new Error('Authentication failed'));
    }
});

// ============================================
// SOCKET CONNECTION HANDLER
// ============================================
io.on('connection', (socket) => {
    const { uid, isAdmin, email } = socket.data;

    // ADMIN CONNECTION
    if (isAdmin) {
        console.log(`👑 Admin connected: ${uid} (${socket.id})`);
        adminSockets.add(socket.id);
        socket.join('admin_room');

        // Send current users to admin
        socket.emit('currentUsers', users);

        socket.on('disconnect', () => {
            console.log(`👑 Admin disconnected: ${uid}`);
            adminSockets.delete(socket.id);
        });

        return;
    }

    // USER CONNECTION
    console.log(`👤 User connected: ${uid} (${socket.id})`);

    // Initialize user in memory if not exists
    if (!users[uid]) {
        users[uid] = {
            lat: undefined,
            lon: undefined,
            accuracy: undefined,
            lastInside: undefined,
            lastSeen: new Date().toISOString(),
            socketId: socket.id,
            email: email
        };
    } else {
        users[uid].socketId = socket.id;
        users[uid].lastSeen = new Date().toISOString();
    }

    // Notify admins
    io.to('admin_room').emit('userConnected', { id: uid, email });

    // ============================================
    // LOCATION UPDATE HANDLER
    // ============================================
    socket.on('locationUpdate', async (data) => {
        const { lat, lon, accuracy } = data;

        // Validate data
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
            console.warn(`⚠️  Invalid location from ${uid}:`, data);
            return;
        }

        const now = new Date().toISOString();

        try {
            // Check if inside geofence
            const userLocation = turf.point([lon, lat]);
            const polygonFeature = turf.polygon([eacPolygon.map(([lat, lon]) => [lon, lat])]);
            const isInside = turf.booleanPointInPolygon(userLocation, polygonFeature);

            const prevUser = users[uid] || {};
            const wasInside = prevUser.lastInside !== undefined && prevUser.lastInside !== null;

            // Update in-memory state
            users[uid] = {
                lat,
                lon,
                accuracy,
                lastInside: isInside ? now : null,
                lastSeen: now,
                socketId: socket.id,
                email: email
            };

            // Write to Firebase Realtime Database
            await db.ref(`users/${uid}`).set({
                lat,
                lon,
                accuracy,
                lastInside: users[uid].lastInside,
                lastSeen: now,
                email: email
            });

            // Send update to admins (correct format)
            io.to('admin_room').emit('userLocationUpdate', {
                [uid]: {
                    lat,
                    lon,
                    accuracy,
                    lastInside: users[uid].lastInside,
                    lastSeen: now
                }
            });

            // Entry detection
            if (!wasInside && isInside) {
                console.log(`📍 User ${uid} ENTERED geofence`);

                await db.ref('events/entries').push({
                    uid,
                    lat,
                    lon,
                    timestamp: now,
                    type: "entry",
                    email
                });

                io.to('admin_room').emit('userEntered', {
                    id: uid,
                    time: now,
                    lat,
                    lon,
                    email
                });
            }

            // Exit detection
            if (wasInside && !isInside) {
                console.log(`🚪 User ${uid} EXITED geofence`);

                await db.ref('events/exits').push({
                    uid,
                    lat,
                    lon,
                    timestamp: now,
                    type: "exit",
                    email
                });

                io.to('admin_room').emit('userExited', {
                    id: uid,
                    time: now,
                    lat,
                    lon,
                    email
                });
            }

        } catch (error) {
            console.error(`❌ Error processing location for ${uid}:`, error.message);
        }
    });

    // ============================================
    // HEARTBEAT HANDLER
    // ============================================
    socket.on('heartbeat', () => {
        if (users[uid]) {
            users[uid].lastSeen = new Date().toISOString();
        }
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================
    socket.on('disconnect', (reason) => {
        console.log(`👤 User ${uid} disconnected: ${reason}`);

        // Mark user as inactive after 5 seconds
        setTimeout(() => {
            if (users[uid] && users[uid].socketId === socket.id) {
                // Don't delete, just mark as inactive
                users[uid].lastSeen = new Date().toISOString();

                // Notify admins
                io.to('admin_room').emit('userDisconnected', uid);
            }
        }, 5000);
    });

    // ============================================
    // ERROR HANDLER
    // ============================================
    socket.on('error', (error) => {
        console.error(`Socket error for ${uid}:`, error);
    });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️  Received ${signal}, starting graceful shutdown...`);

    try {
        // Close Socket.IO connections
        io.close(() => {
            console.log('✅ Socket.IO connections closed');
        });

        // Close HTTP server
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.error('⚠️  Forced shutdown after timeout');
            process.exit(1);
        }, 10000);

    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// UNCAUGHT EXCEPTION HANDLERS
// ============================================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    if (IS_PRODUCTION) {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    if (IS_PRODUCTION) {
        gracefulShutdown('UNHANDLED_REJECTION');
    }
});


// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`📍 Geolocation tracking: ACTIVE`);
    console.log(`🌐 Client URL: ${CLIENT_URL}`);
    console.log(`🔒 Firebase Auth: ENABLED`);
    console.log(`💾 Realtime Database: CONNECTED`);
    console.log(`⏰ Started: ${new Date().toISOString()}`);
    console.log('Env check:', {
        projectId: process.env.FIREBASE_PROJECT_ID ? 'exists' : 'missing',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'exists' : 'missing',
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'exists' : 'missing',
        databaseURL: process.env.FIREBASE_DATABASE_URL ? 'exists' : 'missing',
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

});

// Export for testing
module.exports = { app, server, io };