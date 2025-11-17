// app/api/auth/route.js
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/server-config';
import { setCookie, clearCookie } from '@/lib/cookie-utils';

const MAX_AGE = 60 * 60 * 24 * 5; // 5 days in seconds

export async function POST(request) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'ID Token required' }, { status: 400 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { 
      expiresIn: MAX_AGE * 1000 
    });
    
    await setCookie('session', sessionCookie, { maxAge: MAX_AGE });

    return NextResponse.json({ message: 'Session cookie set successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearCookie('session');
    return NextResponse.json({ message: 'Session cookie cleared' }, { status: 200 });
  } catch (error) {
    console.error('Error clearing session cookie:', error);
    return NextResponse.json({ error: 'Failed to clear session' }, { status: 500 });
  }
}