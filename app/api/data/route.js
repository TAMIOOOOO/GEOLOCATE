// app/api/data/route.js
import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/server-config';
import { cookies } from 'next/headers';

export async function GET() {
  // Await cookies() - Next.js 15+ requirement
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || '';

  // 1. Check for a valid session cookie
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized: No session cookie' }, { status: 401 });
  }

  let decodedClaims;
  try {
    // 2. Verify the session cookie using the Admin SDK
    decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    
  } catch (error) {
    console.error("Session verification failed:", error);
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