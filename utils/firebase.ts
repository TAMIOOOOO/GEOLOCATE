// /lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBHcEtnA6d-TQ6wLrU3hd2vhV2W2gVpWqQ",
  authDomain: "eacgeolocate.firebaseapp.com",
  databaseURL: "https://eacgeolocate-default-rtdb.firebaseio.com",
  projectId: "eacgeolocate",
  storageBucket: "eacgeolocate.firebasestorage.app",
  messagingSenderId: "286483862108",
  appId: "1:286483862108:web:324487ccc7a748c92f8c99",
  measurementId: "G-CGH60QK71C"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Export auth instance
export const auth = getAuth(app);
