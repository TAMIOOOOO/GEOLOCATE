// app/login/AuthForm.js
'use client';

import { useState } from 'react';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';

// Import the pre-initialized Firebase Auth instance
import { auth } from '@/lib/firebase/client-config';

export default function AuthForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true); // Toggle between Login and Signup
    const [error, setError] = useState(null);
    const router = useRouter();

    // app/login/AuthForm.js - REMOVE socketRef reference
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            const user = auth.currentUser;
            const idToken = await user.getIdToken(true);

            // REMOVE THIS LINE - socketRef doesn't exist here
            // socketRef.current?.emit("firebase_login", { idToken: idToken });

            await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ idToken }),
            });

            router.push('/dashboard');

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc' }}>
            <h1>{isLogin ? 'Login' : 'Sign Up'}</h1>
            <form onSubmit={handleSubmit}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px', margin: '10px 0' }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px', margin: '10px 0' }}
                />
                <button type="submit" style={{ padding: '10px 20px', background: 'blue', color: 'white', border: 'none' }}>
                    {isLogin ? 'Sign In' : 'Create Account'}
                </button>
            </form>
            {error && <p style={{ color: 'red', marginTop: '10px' }}>Error: {error}</p>}

            <p style={{ marginTop: '20px' }}>
                <a
                    href="#"
                    onClick={() => setIsLogin(!isLogin)}
                    style={{ textDecoration: 'underline', color: 'blue' }}
                >
                    {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Log In'}
                </a>
            </p>
        </div>
    );
}