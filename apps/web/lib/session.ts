import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@solum/db';

export const SESSION_COOKIE = 'solum_session';

/** The signed-in user, or null. Never throws — callers decide what an absent session means. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token =
    jar.get(SESSION_COOKIE)?.value ??
    // Headless-browser visual QA has no cookie jar to sign in with. Outside production only, a
    // real session token (inserted by hand for a seeded user) can be supplied by env instead of
    // cookie — this still runs the actual lookup below, it just skips the browser login form.
    (process.env.NODE_ENV !== 'production' ? process.env.SOLUM_SHOT_SESSION : undefined);
  return getSessionUser(token);
}

/**
 * Every page that shows tenant data calls this.
 *
 * Tenant context comes from the session, not from "the first organisation in the table". Row-level
 * security can only isolate tenants if something actually chooses which tenant the request is for.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export function sessionCookieOptions(expiresInDays = 14) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    // Secure is set only under HTTPS: forcing it in local development silently breaks login,
    // which then looks like a credentials problem.
    secure: process.env.NODE_ENV === 'production',
    maxAge: expiresInDays * 86_400,
  };
}
