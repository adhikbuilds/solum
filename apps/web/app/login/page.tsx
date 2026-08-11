'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="auth-frame">
      <form className="auth" action={action}>
        <p className="auth-mark">Solum</p>
        <h1 className="auth-h">Land feasibility console</h1>
        <p className="auth-sub">
          Appraisals are scoped to your organisation. Sign in to see its pipeline.
        </p>

        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@company.ae"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {/* Errors explain and direct; they do not apologise or hint at which field was wrong. */}
        {state.error ? (
          <p className="auth-error" role="alert">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-foot">
          Local development seeds one account: <code>demo@almizan.ae</code> with the password printed
          by <code>pnpm db:seed</code>.
        </p>
      </form>
    </main>
  );
}
