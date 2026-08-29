import Link from 'next/link';
import { logout } from '@/app/login/actions';
import type { SessionUser } from '@solum/db';

// Not deployed anywhere yet -- the massing service only runs via `docker compose up` in the
// feat/massing-engine worktree today. Defaults to that local port so the link at least works in
// dev; set NEXT_PUBLIC_MASSING_URL once it has a real hosted address.
const MASSING_URL = process.env.NEXT_PUBLIC_MASSING_URL || 'http://localhost:5180';

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
      <nav className="rail-nav">
        <Link href="/">Pipeline</Link>
        <Link href="/compare">Compare</Link>
        <Link href="/market">Market</Link>
        {/* Massing lives in its own service (`massing/` + `web/` on feat/massing-engine) --
            different architecture, different git history, deliberately not merged into this
            app. Routed out to rather than embedded; see docs/prd/massing.md §9. */}
        <a href={MASSING_URL} target="_blank" rel="noopener noreferrer">
          Massing study ↗
        </a>
        {/* The pre-rebuild single-file prototype, kept reachable rather than deleted -- it's
            still the more feature-complete client-facing demo (JV proposals, PDF export) until
            those workflows land here. Served as a static file, not part of this app's routes. */}
        <a href="/legacy/solum.html" target="_blank" rel="noopener noreferrer">
          Classic (legacy) ↗
        </a>
      </nav>
      <span className="rail-ctx">
        <b>{organisation}</b>
        {workspace ? ` · ${workspace}` : null}
      </span>
      <span className="rail-spacer" />
      <Link href="/plots/new" className="rail-cta">
        New plot
      </Link>
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
