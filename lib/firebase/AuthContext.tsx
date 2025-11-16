// lib/firebase/AuthContext.tsx (RENAMED FILE)
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
// IMPORT THE FIREBASE USER TYPE
import { 
  onAuthStateChanged, 
  signOut, 
  User, // <--- Import the Firebase User type
  getIdTokenResult 
} from 'firebase/auth';

import { auth } from '@/lib/firebase/client-config'; 

// 1. DEFINE CONTEXT TYPE
interface AuthContextType {
    user: User | null; // The user object is either a Firebase User or null
    loading: boolean;
    logout: () => Promise<void>; // Explicitly defines logout as an async function
}

// 2. Create the Context with the defined type
const AuthContext = createContext<AuthContextType | null>(null);

// 3. Define the useAuth hook with explicit return type (Fixes Error 2349)
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// 4. Define the AuthProvider Component
export default function AuthProvider({ children }: { children: React.ReactNode }) { // <--- Added children typing
  const [user, setUser] = useState<User | null>(null); // <--- Added User type to state
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // firebaseUser is automatically typed as User | null
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      
      if (firebaseUser) {
        // This is safe because firebaseUser is typed as User
        await firebaseUser.getIdTokenResult(true); 
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      await fetch('/api/auth', {
        method: 'DELETE',
      });
    } catch (e) {
      console.error("Logout failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = { // <--- Explicitly type the value object
    user,
    loading,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
      {loading && <div>Loading authentication state...</div>}
    </AuthContext.Provider>
  );
}