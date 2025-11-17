import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const adminDb = getDatabase();

export { adminDb };
console.log('Env check:', {
  projectId: process.env.FIREBASE_PROJECT_ID ? 'exists' : 'missing',
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'exists' : 'missing',
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'exists' : 'missing',
  databaseURL: process.env.FIREBASE_DATABASE_URL ? 'exists' : 'missing',
});