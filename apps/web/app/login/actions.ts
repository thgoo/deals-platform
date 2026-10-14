'use server';

import { redirect } from 'next/navigation';
import { logIn, logOut } from '@/app/admin/_lib/auth';

export interface LoginState {
  error: string | null;
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  if (!(await logIn(password))) {
    // Flat delay on failure, on top of scrypt's cost, to slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: 'Wrong password' };
  }
  redirect('/admin');
}

export async function logout(): Promise<void> {
  await logOut();
  redirect('/login');
}
