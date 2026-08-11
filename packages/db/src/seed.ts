/**
 * Seed a working local database.
 *
 *   pnpm --filter @solum/db seed
 *
 * The important property: comparables are **derived**, not stated. This script writes synthetic
 * transactions and then computes the band from them by SQL percentile, so the market-data pipeline
 * is exercised end to end. The beta's failure was hardcoding "AED 1,750" as a string in the page;
 * hardcoding it in a seed file would be the same mistake one layer down.
 *
 * Every row is tagged `source = 'seed'`. The UI must surface that. Synthetic data presented as
 * observed market data is worse than no data, because it cannot be corrected by anyone downstream.
 */
import { createHash } from 'node:crypto';
import { appraise, ENGINE_VERSION, DUBAI_DEFAULT_COSTS } from '@solum/engine';
import type { AppraisalInput, ComparablesBand, UnitType } from '@solum/engine';
import { withAdmin, close } from './client.js';
import { hashPassword } from './auth.js';
import type { PoolClient } from 'pg';

const COMMUNITY = 'Wadi Al Safa 3';
const AS_OF = '2026-07-12';
const ORG_NAME = 'Al Mizan (demo)';
const DEMO_EMAIL = 'demo@almizan.ae';
/*
 * Local demo password. Overridable, and deliberately NOT the credential that was shared over chat
 * for the deployed beta — a password in a git-tracked seed file must never be one that works
 * anywhere real.
 */
const DEMO_PASSWORD = process.env['SEED_DEMO_PASSWORD'] ?? 'solum-local-demo';

/**
 * Deterministic PRNG. The engine forbids randomness; a seed script may use it, but it must be
 * reproducible or two developers get different databases and compare different numbers.
 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1103515245, state) + 12345) >>> 0;
    return state / 0x100000000;
  };
}

/** 24 months of transactions on a rising trend, so a 6-month window yields a realistic band. */
function generateTransactions(): {
  monthsAgo: number;
  unitType: string;
  areaSqft: number;
  pricePsfFils: bigint;
  isOffPlan: boolean;
  floor: number;
}[] {
  const rand = lcg(20260712);
  const types = [
    { code: 'STUDIO', area: 480, factor: 0.94 },
    { code: '1BR', area: 827, factor: 1.0 },
    { code: '2BR', area: 1549, factor: 0.96 },
    { code: '3BR', area: 1548, factor: 0.93 },
  ] as const;

  const rows: ReturnType<typeof generateTransactions> = [];
  for (let monthsAgo = 23; monthsAgo >= 0; monthsAgo--) {
    // Trend: AED 1,450/sqft two years ago rising to AED 1,820 today.
    const trend = 1450 + ((23 - monthsAgo) / 23) * 370;
    const count = 5 + Math.floor(rand() * 4);

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(rand() * types.length)]!;
      const noise = (rand() - 0.5) * 300; // ±150/sqft
      const psf = (trend + noise) * type.factor;
      rows.push({
        monthsAgo,
        unitType: type.code,
        areaSqft: type.area + Math.round((rand() - 0.5) * 60),
        pricePsfFils: BigInt(Math.round(psf * 100)),
        isOffPlan: rand() > 0.4,
        floor: 1 + Math.floor(rand() * 28),
      });
    }
  }
  return rows;
}

/** The three launches the beta had as string literals in its page source. Now rows, with a source. */
const LAUNCHES = [
  { name: 'Skyline Residences', psf: 178_000n, sold: 64, completion: 'Q4 2027' },
  { name: 'Al Safa Heights 2', psf: 164_000n, sold: 41, completion: 'Q2 2028' },
  { name: 'Meydan Gardens', psf: 191_000n, sold: 82, completion: 'Q1 2027' },
];

function seedUnits(onePsf: bigint): UnitType[] {
  // bays is parking provision per unit: 1 for studio and 1BR, 2 for 2BR and above (Dubai practice).
  return [
    { code: 'STUDIO', label: 'Studio', enabled: false, unitCount: 40, avgAreaSqft: 480, pricePsf: 167_500n, bays: 1 },
    { code: '1BR', label: '1 bedroom', enabled: true, unitCount: 96, avgAreaSqft: 827, pricePsf: onePsf, bays: 1 },
    { code: '2BR', label: '2 bedroom', enabled: true, unitCount: 30, avgAreaSqft: 1549, pricePsf: 180_000n, bays: 2 },
    { code: '3BR', label: '3 bedroom', enabled: true, unitCount: 21, avgAreaSqft: 1548, pricePsf: 175_000n, bays: 2 },
  ];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? `${v}n` : v instanceof Object && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

async function main(): Promise<void> {
  await withAdmin(async (client) => {
    /*
     * Refuse to seed on top of existing data.
     *
     * Seeding twice silently doubles the transaction count and the comparables band drifts with no
     * indication why. In a demo that reads as the tool being unreliable, which is the one thing it
     * cannot afford to look like.
     */
    const existing = await client.query<{ n: string }>('SELECT count(*) AS n FROM organisations');
    if (Number(existing.rows[0]?.n ?? 0) > 0 && process.env['SEED_FORCE'] !== '1') {
      throw new Error(
        'The database already contains data, and seeding on top of it would double the ' +
          'transaction count and drift the comparables band.\n' +
          '  To start over:        pnpm db:fresh\n' +
          '  To add a second org:  SEED_FORCE=1 pnpm db:seed',
      );
    }

    await client.query('BEGIN');
    try {
      // ── Tenancy ──────────────────────────────────────────────────────────
      const org = await one<{ id: string }>(
        client,
        `INSERT INTO organisations (name) VALUES ($1) RETURNING id`,
        [ORG_NAME],
      );
      const user = await one<{ id: string }>(
        client,
        `INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash
         RETURNING id`,
        [DEMO_EMAIL, 'Al Mizan demo user', await hashPassword(DEMO_PASSWORD)],
      );
      await client.query(
        `INSERT INTO memberships (organisation_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [org.id, user.id],
      );
      const workspace = await one<{ id: string }>(
        client,
        `INSERT INTO workspaces (organisation_id, name) VALUES ($1, $2) RETURNING id`,
        [org.id, 'Dubai land pipeline'],
      );

      // ── Market data ──────────────────────────────────────────────────────
      const community = await one<{ id: string }>(
        client,
        `INSERT INTO communities (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [COMMUNITY],
      );

      const transactions = generateTransactions();
      for (const t of transactions) {
        const priceFils = BigInt(Math.round(Number(t.pricePsfFils) * t.areaSqft));
        await client.query(
          `INSERT INTO dld_transactions
             (community_id, transaction_date, unit_type, area_sqft, price_fils,
              price_psf_fils, is_off_plan, floor, source)
           VALUES ($1, ($2::date - make_interval(months => $3)), $4, $5, $6, $7, $8, $9, 'seed')`,
          [
            community.id, AS_OF, t.monthsAgo, t.unitType, t.areaSqft,
            priceFils.toString(), t.pricePsfFils.toString(), t.isOffPlan, t.floor,
          ],
        );
      }

      for (const l of LAUNCHES) {
        await client.query(
          `INSERT INTO comparable_launches
             (community_id, project_name, price_psf_fils, pct_sold, completion, source, observed_at)
           VALUES ($1, $2, $3, $4, $5, 'seed', $6::date)`,
          [community.id, l.name, l.psf.toString(), l.sold, l.completion, AS_OF],
        );
      }

      // The band is COMPUTED from the transactions above — off-plan only, trailing 6 months.
      // The method string goes into the report so a reader can follow how it was derived.
      const method = 'p10/median/p90 of off-plan price per sqft, trailing 6 months, unweighted';
      const snapshot = await one<{
        id: string; low: string; median: string; high: string; sample_size: number;
      }>(
        client,
        `WITH windowed AS (
           SELECT price_psf_fils FROM dld_transactions
           WHERE community_id = $1
             AND is_off_plan
             AND transaction_date > ($2::date - INTERVAL '6 months')
         )
         INSERT INTO comparable_snapshots
           (community_id, as_of, method, low_psf_fils, median_psf_fils, high_psf_fils,
            sample_size, source)
         SELECT $1, $2::date, $3,
                percentile_disc(0.10) WITHIN GROUP (ORDER BY price_psf_fils),
                percentile_disc(0.50) WITHIN GROUP (ORDER BY price_psf_fils),
                percentile_disc(0.90) WITHIN GROUP (ORDER BY price_psf_fils),
                count(*), 'seed'
         FROM windowed
         RETURNING id, low_psf_fils AS low, median_psf_fils AS median,
                   high_psf_fils AS high, sample_size`,
        [community.id, AS_OF, method],
      );

      // Per-unit-type bands via the ported prototype method: P5–P95 trimmed, recency-weighted
      // on a one-year half-life. This is what lets a report say "1BR: AED 1,780 from 34
      // transactions" instead of one opaque area-wide number.
      const bands = await client.query<{
        unit_type: string; sample_n: number; price_psf_fils: string;
        median_area: string; latest: string;
      }>(
        `INSERT INTO snapshot_unit_bands
           (snapshot_id, unit_type, price_psf_fils, median_area, sample_n, latest)
         SELECT $1, unit_type, price_psf_fils, median_area, sample_n, latest
         FROM comps_by_unit_type($2, $3::date, 24, true)
         RETURNING unit_type, sample_n, price_psf_fils, median_area, latest`,
        [snapshot.id, community.id, AS_OF],
      );

      // ── Plots, each appraised by the real engine ─────────────────────────
      // Four deliberately different outcomes, so the pipeline shows the full range including a
      // refusal. Only the 1BR price and the land cost vary; everything else is held constant.
      const PLOTS = [
        {
          name: 'Wadi Al Safa 3 — Plot 4471', dldNumber: '6452471',
          lat: 25.0731, lng: 55.2913, landAed: 83_000_000, onePsf: 200_000n,
          harshDownside: false, note: 'priced above the comparables band — engine withholds',
        },
        {
          name: 'Wadi Al Safa 3 — Plot 3902', dldNumber: '6452390',
          lat: 25.0688, lng: 55.2864, landAed: 60_000_000, onePsf: 178_000n,
          harshDownside: false, note: 'clears the 20% hurdle comfortably',
        },
        {
          // Harsher stress test (-20% price, +20% cost) than the others, as a developer might
          // apply to a deal they are less sure of. Base case clears, downside does not.
          name: 'Wadi Al Safa 3 — Plot 5118', dldNumber: '6452511',
          lat: 25.0762, lng: 55.2951, landAed: 83_000_000, onePsf: 178_000n,
          harshDownside: true, note: 'base clears but the downside runs at a loss — downgraded',
        },
        {
          name: 'Wadi Al Safa 3 — Plot 2274', dldNumber: '6452227',
          lat: 25.0705, lng: 55.2822, landAed: 120_000_000, onePsf: 178_000n,
          harshDownside: false, note: 'land too expensive',
        },
      ] as const;

      const comparables: ComparablesBand = {
        snapshotId: snapshot.id,
        asOf: AS_OF,
        community: COMMUNITY,
        lowPsf: BigInt(snapshot.low),
        medianPsf: BigInt(snapshot.median),
        highPsf: BigInt(snapshot.high),
        sampleSize: snapshot.sample_size,
      };

      const created: { name: string; verdict: string; flags: string[]; note: string }[] = [];

      for (const def of PLOTS) {
        const plot = await one<{ id: string }>(
          client,
          `INSERT INTO plots
             (organisation_id, workspace_id, community_id, name, dld_plot_number,
              land_area_sqft, far, gfa_sqft, saleable_area_sqft, land_cost_fils,
              centroid_lat, centroid_lng, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [
            org.id, workspace.id, community.id, def.name, def.dldNumber,
            62_000, 3.194, 198_000, 158_370, (def.landAed * 100).toString(),
            def.lat, def.lng, user.id,
          ],
        );

        const input: AppraisalInput = {
          plot: {
            plotId: plot.id,
            community: COMMUNITY,
            landAreaSqft: 62_000,
            gfaSqft: 198_000,
            saleableAreaSqft: 158_370,
            landCost: BigInt(def.landAed) * 100n,
          },
          units: seedUnits(def.onePsf),
          // The prototype's real Dubai defaults — construction on BUA at AED 345/sqft, architect
          // fees split 2.5/2.5, 10% contingency, parking at AED 55,000 a bay. See engine defaults.ts.
          costs: { ...DUBAI_DEFAULT_COSTS },
          comparables,
          scenarios: [
            { name: 'Base', salePriceDelta: 0, constructionCostDelta: 0 },
            def.harshDownside
              ? { name: 'Downside', salePriceDelta: -0.2, constructionCostDelta: 0.2 }
              : { name: 'Downside', salePriceDelta: -0.1, constructionCostDelta: 0.1 },
            { name: 'Upside', salePriceDelta: 0.08, constructionCostDelta: -0.03 },
          ],
          targetProfitOnCost: 0.2,
          passThreshold: 0.2,
          marginalThreshold: 0.12,
        };

        const appraisal = await one<{ id: string }>(
          client,
          `INSERT INTO appraisals
             (organisation_id, plot_id, comparable_snapshot_id, label, status, created_by)
           VALUES ($1,$2,$3,$4,'computed',$5) RETURNING id`,
          [org.id, plot.id, snapshot.id, 'Initial underwrite', user.id],
        );

        const serialised = stableStringify(input);
        const set = await one<{ id: string }>(
          client,
          `INSERT INTO assumption_sets
             (organisation_id, appraisal_id, inputs, input_hash, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            org.id, appraisal.id, serialised,
            createHash('sha256').update(serialised).digest('hex').slice(0, 32), user.id,
          ],
        );

        const result = appraise(input);
        await client.query(
          `INSERT INTO results
             (organisation_id, assumption_set_id, engine_version, verdict, verdict_reason,
              outputs, trace, flags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            org.id, set.id, result.engineVersion, result.verdict, result.verdictReason,
            stableStringify(result.outputs), JSON.stringify(result.trace),
            JSON.stringify(result.flags),
          ],
        );

        created.push({
          name: def.name,
          verdict: result.verdict,
          flags: result.flags.map((f) => `${f.severity}:${f.code}`),
          note: def.note,
        });
      }

      await client.query('COMMIT');

      const fmt = (f: string): string => `AED ${(Number(f) / 100).toFixed(0)}/sqft`;
      console.log(`\nSeeded.\n`);
      console.log(`  organisation_id  ${org.id}`);
      console.log(`  workspace        ${workspace.id}`);
      console.log(`  sign in as       ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
      console.log(`  ${transactions.length} synthetic DLD transactions over 24 months`);
      console.log(`  comparables band DERIVED from them, not stated:`);
      console.log(`    low     ${fmt(snapshot.low)}`);
      console.log(`    median  ${fmt(snapshot.median)}`);
      console.log(`    high    ${fmt(snapshot.high)}`);
      console.log(`    n = ${snapshot.sample_size}   method: ${method}\n`);
      console.log(`  per-unit-type bands (P5–P95 trimmed, 1-year half-life recency weight):`);
      for (const b of bands.rows) {
        console.log(
          `    ${b.unit_type.padEnd(7)} ${fmt(b.price_psf_fils).padStart(16)}` +
            `   n=${String(b.sample_n).padStart(3)}   median ${Number(b.median_area)} sqft`,
        );
      }
      console.log();
      console.log(`  engine ${ENGINE_VERSION} — ${created.length} plots appraised:`);
      for (const c of created) {
        console.log(`    ${c.verdict.padEnd(11)} ${c.name}`);
        console.log(`                ${c.note}${c.flags.length ? `  [${c.flags.join(', ')}]` : ''}`);
      }
      console.log(`\n  All market rows tagged source='seed'. Surface that in the UI.\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function one<T extends object>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T> {
  const { rows } = await client.query<T>(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`Expected one row from: ${sql.slice(0, 60)}…`);
  return row;
}

main()
  .catch((error: unknown) => {
    console.error(`\nSeed failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(close);
