// app/login/page.js
// Server Component wrapper for the client form

import AuthForm from './AuthForm';

export default function LoginPage() {
  return (
    <main>
      <AuthForm />
    </main>
  );
}