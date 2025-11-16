// components/ProtectedRoute.js
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext'; // Import your Auth hook

/**
 * A wrapper component that enforces authentication for its children.
 * If the user is not logged in and not loading, they are redirected to /login.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 1. If loading is false AND there is no user, redirect to login
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // 2. While checking auth status, show a loader
  if (loading || !user) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        Checking authentication status...
      </div>
    );
  }

  // 3. Once authenticated, render the protected content
  return children;
}