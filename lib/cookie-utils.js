// lib/cookie-utils.js
import { cookies } from 'next/headers';

/**
 * Set a cookie in a standardized way
 * @param {string} name - cookie name
 * @param {string} value - cookie value
 * @param {object} options - optional cookie settings
 */
export async function setCookie(name, value, options = {}) {
  const cookieStore = await cookies();
  cookieStore.set({
    name,
    value,
    maxAge: options.maxAge || 60 * 60 * 24 * 5, // default 5 days
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? (process.env.NODE_ENV === 'production'),
    path: options.path || '/',
    sameSite: options.sameSite || 'lax',
  });
}

/**
 * Clear a cookie by name
 * @param {string} name - cookie name
 */
export async function clearCookie(name) {
  const cookieStore = await cookies();
  cookieStore.set({
    name,
    value: '',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Get a cookie by name
 * @param {string} name - cookie name
 */
export async function getCookie(name) {
  const cookieStore = await cookies();
  return cookieStore.get(name)?.value || null;
}