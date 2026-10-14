import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/app/admin/_lib/auth';
import LoginForm from './login-form';

export const metadata: Metadata = {
  title: 'login',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await isAdmin()) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <LoginForm />
    </main>
  );
}
