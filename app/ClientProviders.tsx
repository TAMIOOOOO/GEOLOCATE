'use client';

import { ReactNode } from 'react';
import AuthProvider from '@/lib/firebase/AuthContext';

export default function ClientProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
