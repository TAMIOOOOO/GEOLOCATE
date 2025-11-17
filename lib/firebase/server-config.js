// lib/firebase/server-config.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_RTDB_URL || process.env.FIREBASE_DATABASE_URL,
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore(); // For Firestore
export const adminDatabase = admin.database(); // For Realtime Database