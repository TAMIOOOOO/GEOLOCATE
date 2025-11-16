import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/server-config';

// Paths that require authentication
const PROTECTED_PATHS = ['/dashboard', '/admin'];
// Paths that require no authentication (login/register/home)
const PUBLIC_PATHS = ['/login', '/register', '/'];

/**
 * Check if pathname should be ignored (like _next/static, _next/image, api, favicon)
 */
function isIgnoredPath(pathname) {
  return (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico'
  );
}

/**
 * Main handler to replicate middleware behavior
 */
async function handleRequest(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Skip ignored paths
  if (isIgnoredPath(pathname)) {
    return NextResponse.next();
  }

  // Get session cookie
  const sessionCookie = req.cookies.get('session')?.value;
  let isAuthenticated = false;
  let decodedClaims = null;

  if (sessionCookie) {
    try {
      decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
      isAuthenticated = true;
    } catch (err) {
      console.log('Proxy route: invalid session cookie');
      isAuthenticated = false;
    }
  }

  // --- REDIRECTION LOGIC ---

  // Authenticated users
  if (isAuthenticated) {
    if (PUBLIC_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (pathname === '/admin' && !decodedClaims.isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // Unauthenticated users
  if (!isAuthenticated && PROTECTED_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

// Handle GET, POST, and other methods
export async function GET(req) {
  return handleRequest(req);
}
export async function POST(req) {
  return handleRequest(req);
}
export async function PUT(req) {
  return handleRequest(req);
}
export async function DELETE(req) {
  return handleRequest(req);
}
export async function PATCH(req) {
  return handleRequest(req);
}
