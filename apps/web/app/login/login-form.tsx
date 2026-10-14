'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initialState: LoginState = { error: null };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form
      action={formAction}
      className="border-foreground w-full max-w-sm space-y-4 border-3 bg-white p-6"
    >
      <h1 className="text-lg font-black tracking-wider uppercase">Admin</h1>
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="Password"
        required
        autoFocus
        className="border-foreground w-full border-2 px-3 py-2"
      />
      {state.error && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="border-foreground w-full border-2 bg-yellow-300 px-3 py-2 font-black uppercase disabled:opacity-50"
      >
        {pending ? 'Checking…' : 'Log in'}
      </button>
    </form>
  );
}
