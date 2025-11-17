// components/AdminRoute.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (loading) return;

      if (!user) {
        console.log("❌ No user found, redirecting to home");
        router.push('/');
        return;
      }

      try {
        console.log("🔍 Checking admin status for:", user.email);
        const idTokenResult = await user.getIdTokenResult(true);
        const adminClaim = idTokenResult.claims.admin === true;
        
        console.log("📋 Token claims:", idTokenResult.claims);
        console.log("👑 Is Admin:", adminClaim);
        
        if (!adminClaim) {
          console.log("❌ Access denied - not an admin");
          alert('Access Denied: You must be an administrator to access this page.\n\nContact system administrator for access.');
          router.push('/');
        } else {
          console.log("✅ Admin access granted");
          setIsAdmin(true);
        }
      } catch (error) {
        console.error('❌ Error checking admin status:', error);
        alert('Error verifying admin status. Please log out and back in.');
        router.push('/');
      } finally {
        setChecking(false);
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  if (loading || checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl text-gray-700 dark:text-gray-300 font-medium">Verifying admin access...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">🚫</div>
          <p className="text-xl text-gray-700 dark:text-gray-300 font-medium">Access Denied</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Redirecting...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}