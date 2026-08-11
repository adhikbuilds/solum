import Link from 'next/link';

/**
 * The rail carries the seeded-data warning permanently.
 *
 * Not as a dismissible banner. A viewer who does not know the market data is synthetic can act on
 * it, and synthetic data presented as observed data is worse than no data — nobody downstream can
 * correct it. It comes down when real DLD data lands, not before.
 */
export function Rail({ organisation, workspace }: { organisation: string; workspace?: string }) {
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
    </header>
  );
}
