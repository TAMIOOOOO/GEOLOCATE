// app/api/data/route.js

import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/server-config'; // Import Admin Auth
import { cookies } from 'next/headers'; 

export async function GET() {
  const sessionCookie = cookies().get('session')?.value || '';

  // 1. Check for a valid session cookie
  if (!sessionCookie) {
    // If no cookie, return unauthorized immediately
    return NextResponse.json({ error: 'Unauthorized: No session cookie' }, { status: 401 });
  }

  let decodedClaims;
  try {
    // 2. Verify the session cookie using the Admin SDK
    // This is fast and secure, as it only checks the signature and expiration.
    decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    
    // The decodedClaims object contains the user's UID (decodedClaims.uid)
    // which you can use for database operations.

  } catch (error) {
    console.error("Session verification failed:", error);
    // If verification fails (e.g., expired, revoked, tampered), return unauthorized
    return NextResponse.json({ error: 'Unauthorized: Invalid session' }, { status: 401 });
  }
  
  // --- START SECURE LOGIC ---
  try {
    // Optional: Use the verified UID to scope data fetching
    const userId = decodedClaims.uid; 
    
    // Example: Fetch data securely using the Admin SDK
    const usersSnapshot = await adminDb.collection('users').get();
    
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ data: users, userId: userId }, { status: 200 });

  } catch (error) {
    console.error("Server-side data fetch error:", error);
    return NextResponse.json(
      { error: 'Failed to fetch data securely.' }, 
      { status: 500 }
    );
  }
}