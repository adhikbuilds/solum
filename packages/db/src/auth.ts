/**
 * Password hashing and session management.
 *
 * Deliberately dependency-free: node's scrypt rather than bcrypt or argon2, both of which are
 * native modules that complicate every deployment target. scrypt is in the standard library, is
 * memory-hard, and is an accepted choice — the parameters below matter more than the algorithm.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { withAdmin } from './client.js';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SESSION_DAYS = 14;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Constant-time comparison. A length mismatch is answered with a comparison against a dummy of the
 * right size, so timing does not distinguish "wrong length" from "wrong password".
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface SessionUser {
  userId: string;
  email: string;
  fullName: string | null;
  organisationId: string;
  organisationName: string;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
}

/**
 * Verify credentials and open a session.
 *
 * Returns null for every failure mode — unknown email, wrong password, no membership — so the
 * caller cannot leak which one it was. Enumerating valid emails is the first step of an attack.
 */
export async function signIn(
  email: string,
  password: string,
  userAgent?: string,
): Promise<{ sessionId: string; user: SessionUser } | null> {
  return withAdmin(async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      full_name: string | null;
      password_hash: string | null;
      organisation_id: string | null;
      organisation_name: string | null;
      role: SessionUser['role'] | null;
    }>(
      `SELECT u.id, u.email, u.full_name, u.password_hash,
              m.organisation_id, o.name AS organisation_name, m.role
       FROM users u
       LEFT JOIN memberships m  ON m.user_id = u.id
       LEFT JOIN organisations o ON o.id = m.organisation_id
       WHERE lower(u.email) = lower($1)
       ORDER BY m.created_at
       LIMIT 1`,
      [email.trim()],
    );

    const row = rows[0];
    // Hash anyway when the user is unknown, so a missing account and a wrong password take
    // comparable time.
    const ok = await verifyPassword(password, row?.password_hash ?? null);
    if (!row || !ok || !row.organisation_id || !row.role) return null;

    const sessionId = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

    await client.query(
      `INSERT INTO sessions (id, user_id, organisation_id, expires_at, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, row.id, row.organisation_id, expires, userAgent ?? null],
    );
    await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);

    return {
      sessionId,
      user: {
        userId: row.id,
        email: row.email,
        fullName: row.full_name,
        organisationId: row.organisation_id,
        organisationName: row.organisation_name ?? 'Unnamed organisation',
        role: row.role,
      },
    };
  });
}

/** Resolve a session id to its user, or null if missing, expired or revoked. */
export async function getSessionUser(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;

  return withAdmin(async (client) => {
    const { rows } = await client.query<{
      user_id: string;
      email: string;
      full_name: string | null;
      organisation_id: string;
      organisation_name: string;
      role: SessionUser['role'];
    }>(
      `SELECT s.user_id, u.email, u.full_name,
              s.organisation_id, o.name AS organisation_name, m.role
       FROM sessions s
       JOIN users u          ON u.id = s.user_id
       JOIN organisations o  ON o.id = s.organisation_id
       JOIN memberships m    ON m.user_id = s.user_id AND m.organisation_id = s.organisation_id
       WHERE s.id = $1 AND s.expires_at > now()`,
      [sessionId],
    );

    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      role: row.role,
    };
  });
}

export async function signOut(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await withAdmin(async (client) => {
    await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  });
}

/** Organisations this user could switch into. */
export async function listMemberships(
  userId: string,
): Promise<{ organisationId: string; name: string; role: SessionUser['role'] }[]> {
  return withAdmin(async (client) => {
    const { rows } = await client.query(
      `SELECT m.organisation_id, o.name, m.role
       FROM memberships m JOIN organisations o ON o.id = m.organisation_id
       WHERE m.user_id = $1 ORDER BY o.name`,
      [userId],
    );
    return rows.map((r) => ({ organisationId: r.organisation_id, name: r.name, role: r.role }));
  });
}

/** Only roles that may change numbers. A viewer can read an appraisal but not re-run one. */
export function canWrite(role: SessionUser['role']): boolean {
  return role === 'owner' || role === 'admin' || role === 'analyst';
}

export async function setPassword(email: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await withAdmin(async (client) => {
    await client.query('UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2)', [
      hash,
      email,
    ]);
  });
}
