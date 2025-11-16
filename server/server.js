// server.js
"use strict";

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const turf = require('@turf/turf');
const admin = require('firebase-admin');
require('dotenv').config({ path: '../.env.local' });

const app = express();
const server = http.createServer(app);

// Environment variables
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3001";

// Firebase Admin initialization
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
    console.log('✅ Firebase Admin initialized successfully.');
} catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    process.exit(1);
}

// Reference to Realtime Database
const db = admin.database();

// Express middleware
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// In-memory store for real-time quick access
const users = {}; // { UID: { lat, lon, accuracy, lastInside, lastSeen } }

// Geofence polygon
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

// Express authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized: No token provided');
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (!decodedToken || !decodedToken.uid) {
            return res.status(401).send('Unauthorized: Invalid token');
        }

        if (decodedToken.admin !== true) {
            console.warn(`Access denied: User ${decodedToken.uid} attempted non-admin action.`);
            return res.status(403).send('Forbidden: Must be an administrator');
        }

        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token in Express:', error.message);
        return res.status(401).send('Unauthorized: Token verification failed');
    }
};

// Express routes
app.get('/api/eac-polygon', (req, res) => {
    res.json({ polygon: eacPolygon });
});

app.post('/api/eac-polygon', authenticateAdmin, (req, res) => {
    const newPolygon = req.body.polygon;
    if (!Array.isArray(newPolygon) || newPolygon.length < 4) {
        return res.status(400).send('Invalid polygon data');
    }

    eacPolygon = newPolygon;
    console.log(`✏️  Admin ${req.user.uid} updated the geofence polygon.`);

    io.emit('polygonUpdated', { polygon: eacPolygon });
    res.status(200).send('Polygon updated successfully');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connectedUsers: Object.keys(users).length
    });
});

// Socket.IO setup
const io = new Server(server, {
    cors: { origin: CLIENT_URL, methods: ["GET", "POST"] }
});

// Socket authentication middleware
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.error('Socket connection attempt without token');
        return next(new Error('Authentication error: Token required.'));
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (!decodedToken || !decodedToken.uid) {
            return next(new Error('Authentication error: Invalid token.'));
        }

        const isAdmin = decodedToken.admin === true;

        // Store user data in socket
        socket.data.uid = decodedToken.uid;
        socket.data.isAdmin = isAdmin;
        socket.data.email = decodedToken.email;
        socket.data.claims = decodedToken;

        console.log(`🔌 ${isAdmin ? 'Admin' : 'User'} connected: ${decodedToken.uid} (${decodedToken.email || 'no email'})`);
        next();
    } catch (error) {
        console.error('Socket authentication failed:', error.message);
        return next(new Error(`Authentication error: ${error.message}`));
    }
});

// Socket connection handler
io.on('connection', (socket) => {
    const { uid, isAdmin, email } = socket.data;

    // Admin connection
    if (isAdmin) {
        console.log(`👑 Admin ${uid} joined admin room`);
        socket.emit('currentUsers', users);
        socket.join('admin_room');

        socket.on('disconnect', () => {
            console.log(`👑 Admin disconnected: ${uid}`);
            socket.broadcast.to('admin_room').emit('info', {
                message: `Admin ${uid} disconnected`,
                timestamp: new Date().toISOString()
            });
        });

        return;
    }

    // Regular user connection
    console.log(`👤 User ${uid} connected`);
    io.to('admin_room').emit('userConnected', { id: uid, email });

    if (!users[uid]) {
        users[uid] = { lat: undefined, lon: undefined, accuracy: undefined, lastInside: undefined, lastSeen: new Date().toISOString() };
    }

    const UPDATE_INTERVAL_MS = 5000; // 5 seconds per user

    // In server.js, inside io.on('connection', (socket) => { ... })
socket.on('locationUpdate', async (data) => {
    const { lat, lon, accuracy } = data;

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;

    const now = new Date().toISOString();
    const userLocation = turf.point([lon, lat]);
    const polygonFeature = turf.polygon([eacPolygon.map(([lat, lon]) => [lon, lat])]);
    const isInside = turf.booleanPointInPolygon(userLocation, polygonFeature);

    const prevUser = users[uid] || {};
    const wasInside = prevUser.lastInside !== undefined;
    const oldStatus = wasInside ? "Inside" : "Outside";
    const newStatus = isInside ? "Inside" : "Outside";

    // Only update if data changed significantly or time threshold passed
    const shouldUpdate = 
        !prevUser.lat || !prevUser.lon ||
        prevUser.lat !== lat ||
        prevUser.lon !== lon ||
        prevUser.accuracy !== accuracy ||
        (prevUser.lastUpdate && (new Date(now) - new Date(prevUser.lastUpdate)) > 5000); // 5s throttle

    if (!shouldUpdate) return; // Skip update if nothing changed

    // Update in-memory user object
    users[uid] = {
        lat,
        lon,
        accuracy,
        lastInside: isInside ? (prevUser.lastInside || now) : undefined,
        lastSeen: now,
        lastUpdate: now, // track last update timestamp
    };

    // Safely write to Firebase (replace undefined with null)
    await db.ref(`users/${uid}`).set({
        lat,
        lon,
        accuracy,
        lastInside: users[uid].lastInside || null,
        lastSeen: now,
        email: email || null
    });

    // Broadcast to admin room
    io.to('admin_room').emit('userLocationUpdate', { [uid]: users[uid] });

    // Detect entry event
    if (oldStatus === "Outside" && newStatus === "Inside") {
        console.log(`📍 User ${uid} ENTERED the geofence at (${lat.toFixed(5)}, ${lon.toFixed(5)})`);
        await db.ref('events/entries').push({ uid, lat, lon, timestamp: now, type: "entry" });
        io.to('admin_room').emit('userEntered', { id: uid, time: now, lat, lon, email });
    }

    // Detect exit event
    if (oldStatus === "Inside" && newStatus === "Outside" && wasInside) {
        console.log(`📍 User ${uid} EXITED the geofence at (${lat.toFixed(5)}, ${lon.toFixed(5)})`);
        await db.ref('events/exits').push({ uid, lat, lon, timestamp: now, type: "exit" });
        io.to('admin_room').emit('userExited', { id: uid, time: now, lat, lon, email });
        users[uid].lastInside = undefined;
    }
});



    socket.on('heartbeat', () => {
        if (users[uid]) users[uid].lastSeen = new Date().toISOString();
    });

    socket.on('disconnect', () => {
        console.log(`👤 User ${uid} disconnected`);
        setTimeout(() => {
            if (users[uid]) {
                delete users[uid];
                io.to('admin_room').emit('userDisconnected', uid);
            }
        }, 5000);
    });
});

// Start server
server.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Geolocation tracking system active`);
    console.log(`🌐 Client URL: ${CLIENT_URL}`);
    console.log(`🔒 Firebase Authentication: Enabled`);
    console.log(`💾 Firebase Realtime Database: Connected`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
