'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@solum/db';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter an email address and password.' };
  }

  const agent = (await headers()).get('user-agent') ?? undefined;
  const result = await signIn(email, password, agent);

  if (!result) {
    // One message for every failure mode. Distinguishing "no such account" from "wrong password"
    // hands an attacker a way to enumerate who has access.
    return { error: 'Those credentials do not match an account.' };
  }

  (await cookies()).set(SESSION_COOKIE, result.sessionId, sessionCookieOptions());
  redirect('/');
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  await signOut(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
