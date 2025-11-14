const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // frontend port
    methods: ["GET", "POST"],
  },
});

const LOGINS_FILE = path.join(__dirname, "logins.json");

// Load existing logins or initialize empty
let logins = {};
if (fs.existsSync(LOGINS_FILE)) {
  try {
    logins = JSON.parse(fs.readFileSync(LOGINS_FILE, "utf-8"));
  } catch (err) {
    console.error("Failed to parse logins.json, starting fresh");
    logins = {};
  }
}

// Store connected users in memory
let connectedUsers = {};

// Helper: save logins to file
function saveLogins() {
  fs.writeFileSync(LOGINS_FILE, JSON.stringify(logins, null, 2));
}

// Example hardcoded passwords for testing
const passwords = {
  "12345": "pass123",
  "67890": "mypassword",
};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Send current users to new client
  socket.emit("currentUsers", connectedUsers);

  socket.on("login", ({ schoolId, password }) => {
    // Check password
    if (passwords[schoolId] && passwords[schoolId] === password) {
      // Deduplicate: only add if not already connected
      if (!logins[schoolId]) {
        logins[schoolId] = { schoolId, password, lastLogin: new Date().toISOString() };
        saveLogins();
      }

      connectedUsers[schoolId] = { id: schoolId, lat: 0, lon: 0, accuracy: 0 };
      socket.data.schoolId = schoolId; // store for this socket
      socket.emit("loginSuccess");
      console.log("Login success:", schoolId);
    } else {
      socket.emit("loginFailed", "Invalid School ID or Password");
      console.log("Login failed:", schoolId);
    }

    // Send updated user list to everyone
    io.emit("currentUsers", connectedUsers);
  });

  socket.on("updateLocation", ({ schoolId, lat, lon, accuracy }) => {
    if (!connectedUsers[schoolId]) return;
    connectedUsers[schoolId] = { id: schoolId, lat, lon, accuracy };
    io.emit("userLocationUpdate", connectedUsers[schoolId]);
  });

  socket.on("removeUser", (schoolId) => {
    delete connectedUsers[schoolId];
    io.emit("userDisconnected", schoolId);
  });

  socket.on("disconnect", () => {
    const schoolId = socket.data.schoolId;
    if (schoolId) {
      delete connectedUsers[schoolId];
      io.emit("userDisconnected", schoolId);
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
