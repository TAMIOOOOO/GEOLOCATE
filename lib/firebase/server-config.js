import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: process.env.FIREBASE_RTDB_URL,
  });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();