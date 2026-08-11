import Link from 'next/link';
import { logout } from '@/app/login/actions';
import type { SessionUser } from '@solum/db';

/**
 * The rail carries the seeded-data warning permanently.
 *
 * Not as a dismissible banner. A viewer who does not know the market data is synthetic can act on
 * it, and synthetic data presented as observed data is worse than no data — nobody downstream can
 * correct it. It comes down when real DLD data lands, not before.
 */
export function Rail({
  organisation,
  workspace,
  user,
}: {
  organisation: string;
  workspace?: string;
  user?: SessionUser;
}) {
  return (
    <header className="rail">
      <Link href="/" className="rail-mark">
        Solum
      </Link>
      <span className="rail-ctx">
        <b>{organisation}</b>
        {workspace ? ` · ${workspace}` : null}
      </span>
      <span className="rail-spacer" />
      <span className="rail-note" title="Market data in this environment is generated, not observed.">
        Seeded market data
      </span>
      {user ? (
        <>
          <span className="rail-ctx rail-who">
            {user.email} · <b>{user.role}</b>
          </span>
          <form action={logout}>
            <button type="submit" className="rail-out">
              Sign out
            </button>
          </form>
        </>
      ) : null}
    </header>
  );
}
