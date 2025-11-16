// app/api/auth/route.js

import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/server-config'; // Import Admin Auth
import { cookies } from 'next/headers'; // Next.js utility for cookies

// Define a reasonable duration for the session cookie (e.g., 5 days)
const MAX_AGE = 60 * 60 * 24 * 5; // 5 days in seconds

/**
 * POST handler for logging in (creating a session cookie from an ID token).
 * Expected body: { idToken: string }
 */
export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'ID Token required' }, { status: 400 });
    }

    // 1. Verify the ID Token and create a session cookie
    // The Admin SDK ensures the token is valid, fresh, and not revoked.
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: MAX_AGE * 1000 });

    // 2. Set the session cookie securely
    cookies().set('session', sessionCookie, {
      maxAge: MAX_AGE,
      httpOnly: true,     // Protects against XSS
      secure: process.env.NODE_ENV === 'production', // Use secure in production
      path: '/',          // Available across the whole site
      sameSite: 'lax',
    });

    return NextResponse.json({ message: 'Session cookie set successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * DELETE handler for logging out (clearing the session cookie).
 */
export async function DELETE() {
  // Clear the session cookie by setting its value to empty and maxAge to 0
  cookies().set('session', '', {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
  });

  return NextResponse.json({ message: 'Session cookie cleared' }, { status: 200 });
}