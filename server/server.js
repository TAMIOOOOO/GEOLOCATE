const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const turf = require("@turf/turf");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;
const LOGINS_FILE = path.join(__dirname, "logins.json");

// Read/write helpers
function readUsers() {
  try {
    const data = fs.readFileSync(LOGINS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(LOGINS_FILE, JSON.stringify(users, null, 2));
}

// Get user
function getUser(schoolId) {
  const users = readUsers();
  return users.find((u) => u.schoolId === schoolId);
}

// Update location & lastSeen
function updateUserLocation(schoolId, lat, lon, accuracy, inside, socketId) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.schoolId === schoolId);
  if (idx !== -1) {
    users[idx].lat = Number(lat);
    users[idx].lon = Number(lon);
    users[idx].accuracy = Number(accuracy ?? 0);
    users[idx].lastSeen = new Date().toISOString();
    if (inside) users[idx].lastInside = new Date().toISOString();
    users[idx].socketId = socketId;
    writeUsers(users);
    return users[idx];
  }
  return null;
}

// EAC polygon
const eacPolygon = [
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

// Track user connection states to detect new connections
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Send current users as record keyed by schoolId
  const usersArray = readUsers();
  const usersRecord = {};
  usersArray.forEach(u => (usersRecord[u.schoolId] = u));
  socket.emit("currentUsers", usersRecord);

  // LOGIN
  socket.on("login", ({ schoolId, password }) => {
    const users = readUsers();
    const user = users.find((u) => u.schoolId === schoolId);
    if (user && user.password === password) {
      user.socketId = socket.id;
      writeUsers(users);
      
      // Track this user as connected
      connectedUsers.set(schoolId, {
        socketId: socket.id,
        connectedAt: new Date().toISOString()
      });

      socket.emit("loginSuccess", { schoolId, isAdmin: user.isAdmin || false });
      
      // Notify all clients about new user connection (for admin dashboard)
      io.emit("userConnected", { 
        id: schoolId, 
        time: new Date().toISOString() 
      });
    } else {
      socket.emit("loginFailed", "Invalid School ID or Password");
    }
  });

  // REGISTER
  socket.on("register", ({ schoolId, password }) => {
    const users = readUsers();
    if (users.find((u) => u.schoolId === schoolId)) {
      socket.emit("registerFailed", "School ID already exists");
      return;
    }
    const newUser = {
      schoolId,
      password,
      lat: null,
      lon: null,
      accuracy: null,
      lastInside: null,
      lastSeen: null,
      isAdmin: false,
      socketId: socket.id,
    };
    users.push(newUser);
    writeUsers(users);
    socket.emit("registerSuccess", "User registered successfully");
  });

  // LOCATION UPDATE
  socket.on("updateLocation", ({ schoolId, lat, lon, accuracy }) => {
    const pt = turf.point([lon, lat]);
    const poly = turf.polygon([eacPolygon.map(([lat, lon]) => [lon, lat])]);
    const inside = turf.booleanPointInPolygon(pt, poly);

    const prevUser = getUser(schoolId);
    const wasInside = prevUser?.lastInside != null;

    const updatedUser = updateUserLocation(schoolId, lat, lon, accuracy, inside, socket.id);

    if (updatedUser) {
      // Broadcast to all clients
      io.emit("userLocationUpdate", { [updatedUser.schoolId]: updatedUser });
    }

    // Check for geofence transitions and emit notifications
    if (!wasInside && inside) {
      // User entered the building
      io.emit("userEntered", { 
        id: schoolId, 
        time: new Date().toISOString() 
      });
      console.log(`User ${schoolId} entered the building`);
    }

    if (wasInside && !inside) {
      // User exited the building
      io.emit("userExited", { 
        id: schoolId, 
        time: new Date().toISOString() 
      });
      console.log(`User ${schoolId} exited the building`);
    }
  });

  // HEARTBEAT
  socket.on("heartbeat", ({ schoolId }) => {
    const users = readUsers();
    const idx = users.findIndex((u) => u.schoolId === schoolId);
    if (idx !== -1) {
      users[idx].lastSeen = new Date().toISOString();
      writeUsers(users);
      io.emit("userLocationUpdate", { [users[idx].schoolId]: users[idx] });
    }
  });

  // MANUAL REFRESH REQUEST
  socket.on("requestUsers", () => {
    const usersArray = readUsers();
    const usersRecord = {};
    usersArray.forEach(u => (usersRecord[u.schoolId] = u));
    socket.emit("currentUsers", usersRecord);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    
    // Find which user disconnected
    const users = readUsers();
    const disconnectedUser = users.find((u) => u.socketId === socket.id);
    
    if (disconnectedUser) {
      const schoolId = disconnectedUser.schoolId;
      
      // Update user state
      disconnectedUser.lastSeen = null;
      disconnectedUser.socketId = null;
      writeUsers(users);
      
      // Remove from connected users tracking
      connectedUsers.delete(schoolId);
      
      // Notify all clients about disconnection
      io.emit("userDisconnected", schoolId);
      console.log(`User ${schoolId} disconnected`);
    }
  });

  // NOTIFICATION ACKNOWLEDGEMENT (optional - for future use)
  socket.on("notificationRead", ({ notificationId, userId }) => {
    // Could implement server-side notification tracking here
    console.log(`Notification ${notificationId} read by user ${userId}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Notification system enabled - tracking geofence transitions`);
});