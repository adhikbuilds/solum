import Link from 'next/link';

export const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'mix', label: 'Unit mix' },
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'plot', label: 'Plot' },
  { key: 'report', label: 'Report' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export function isTab(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value);
}

/**
 * Tabs, not one long page.
 *
 * The appraisal has five distinct jobs — read the verdict, set the mix, set the costs, check the
 * geometry, hand someone a document — and putting all five in a single scroll gives them equal
 * weight whether or not the reader wants them. Server-rendered via the query string so each tab is
 * a real, linkable URL.
 */
export function PlotTabs({ plotId, active }: { plotId: string; active: TabKey }) {
  return (
    <nav className="tabs" aria-label="Appraisal sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/plots/${plotId}?tab=${t.key}`}
          className="tab"
          aria-current={t.key === active ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
