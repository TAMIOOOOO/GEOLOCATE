import { cookies as nextCookies } from 'next/headers';

/**
 * Set a cookie in a standardized way
 * @param {string} name - cookie name
 * @param {string} value - cookie value
 * @param {object} options - optional cookie settings
 */
export function setCookie(name, value, options = {}) {
  const cookieStore = nextCookies();
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
export function clearCookie(name) {
  setCookie(name, '', { maxAge: 0 });
}
