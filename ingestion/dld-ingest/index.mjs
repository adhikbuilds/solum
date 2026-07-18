// Solum · DLD ingestion
// ---------------------------------------------------------------------------
// Pulls Sales-of-Unit transactions from the UAE-geofenced DLD API and upserts
// them into Supabase. Must run from a UAE IP:
//   • For the demo seed: run locally from a UAE machine — `node index.mjs backfill`.
//   • For later automation: the exported `handler` runs in a UAE cloud runner.
//
// Verified against live data on 2026-07-18 (see docs/prd/dld-comps-integration.md):
//   • Auth flow (a) data.dubai — Bearer token + x-DDA header.
//   • Feed is daily-fresh (newest instance_date was 2 days old), not annual.
//   • Filters use numeric IDs: trans_group_id=1 (Sales), property_type_id=3 (Unit),
//     property_sub_type_id=60 (Flat) — "Unit" alone also includes Office/Shop/Hotel.
//   • reg_type_id: 0 = Off-Plan, 1 = Existing (ready).
//   • rooms_en values: "Studio", "1 B/R", "2 B/R", "3 B/R", …
//
// Secrets come from the environment (never committed):
//   DLD_CLIENT_ID, DLD_CLIENT_SECRET, DLD_APP_IDENTIFIER,
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
// Optional: DLD_SINCE=YYYY-MM-DD  — stop the backfill at this date (keeps the
//   demo seed small + recent; the data spans 2014→now, ~599K rows).

import { createClient } from '@supabase/supabase-js';

const SQM_TO_SQFT = 10.7639;
const DATA_URL  = 'https://apis.data.dubai/open/dld/dld_transactions-open-api';
const TOKEN_URL = 'https://apis.data.dubai/secure/ssis/dubaiai/gatewaytoken/1.0.0/getAccessToken';
// Sales (trans_group 1) of residential Flats (property_type 3 = Unit, sub_type 60 = Flat).
// The sub_type filter is essential: "Unit" also includes Office/Shop/Hotel, which would
// pollute price/ft². All numeric — text-literal filters are rejected by the API.
const BASE_FILTER = 'trans_group_id=1 AND property_type_id=3 AND property_sub_type_id=60';

const env = (k, required = true) => {
  const v = process.env[k];
  if (!v && required) throw new Error(`missing env ${k}`);
  return v;
};

// --- auth (flow a, confirmed) ----------------------------------------------
async function getToken() {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-DDA-SecurityApplicationIdentifier': env('DLD_APP_IDENTIFIER'),
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env('DLD_CLIENT_ID'),
      client_secret: env('DLD_CLIENT_SECRET'),
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text().catch(() => '')}`);
  return (await r.json()).access_token;
}

async function fetchPage(token, { page = 1, pageSize = 1000, filter, order_by, order_dir, limit } = {}) {
  const p = new URLSearchParams();
  if (filter)    p.set('filter', filter);
  if (order_by)  p.set('order_by', order_by);
  if (order_dir) p.set('order_dir', order_dir);
  if (limit)     p.set('limit', String(limit));
  else { p.set('page', String(page)); p.set('pageSize', String(pageSize)); }
  const r = await fetch(`${DATA_URL}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`data ${r.status}: ${await r.text().catch(() => '')}`);
  return (await r.json()).results ?? [];
}

// --- transforms (confirmed against live rows) ------------------------------
function normaliseRooms(rooms_en) {
  if (!rooms_en) return null;
  const s = String(rooms_en).toUpperCase();
  if (s.includes('STUDIO')) return 'Studio';
  const m = s.match(/(\d+)\s*B/);            // "1 B/R" → 1BR, "3 B/R" → 3BR
  if (m) return +m[1] >= 4 ? '4BR+' : `${+m[1]}BR`;
  if (s.includes('PENTHOUSE')) return '4BR+';
  return null;
}
const regType = (r) => String(r.reg_type_id) === '0' ? 'offplan' : 'ready';

function transform(r) {
  const sizeSqm = parseFloat(r.procedure_area);
  const perSqm  = parseFloat(r.meter_sale_price);
  return {
    transaction_id:       r.transaction_id,
    instance_date:        r.instance_date || null,
    area_id:              r.area_id != null ? parseInt(r.area_id, 10) : null,
    area_name_en:         r.area_name_en || null,
    project_name_en:      r.project_name_en || null,
    building_name_en:     r.building_name_en || null,
    unit_type:            normaliseRooms(r.rooms_en),
    rooms_en_raw:         r.rooms_en || null,
    reg_type:             regType(r),
    property_type_en:     r.property_type_en || null,
    property_sub_type_en: r.property_sub_type_en || null,
    size_sqft:            Number.isFinite(sizeSqm) ? +(sizeSqm * SQM_TO_SQFT).toFixed(2) : null,
    price_per_sqft:       Number.isFinite(perSqm) ? +(perSqm / SQM_TO_SQFT).toFixed(2) : null,
    actual_worth:         parseFloat(r.actual_worth) || null,
  };
}

async function upsertBatch(sb, rows) {
  const clean = rows.map(transform).filter(t => t.transaction_id && t.price_per_sqft != null);
  if (!clean.length) return 0;
  const { error } = await sb.from('dld_transactions').upsert(clean, { onConflict: 'transaction_id' });
  if (error) throw new Error(`upsert tx: ${error.message}`);
  // Keep the canonical community list current from whatever we saw.
  const locs = new Map();
  for (const t of clean) if (t.area_id != null) locs.set(t.area_id, t.area_name_en);
  if (locs.size) {
    const rowsL = [...locs].map(([area_id, area_name_en]) => ({ area_id, area_name_en }));
    const { error: e2 } = await sb.from('dld_locations').upsert(rowsL, { onConflict: 'area_id' });
    if (e2) throw new Error(`upsert locations: ${e2.message}`);
  }
  return clean.length;
}

// --- run -------------------------------------------------------------------
export async function run(mode = 'probe') {
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });
  const token = await getToken();

  if (mode === 'probe') {
    const [newest] = await fetchPage(token, { order_by: 'instance_date', order_dir: 'desc', limit: 1 });
    const d = newest?.instance_date ?? null;
    await sb.from('ingestion_runs').insert({ mode, status: 'ok', max_instance_date: d,
      finished_at: new Date().toISOString(), note: `newest instance_date=${d}` });
    return { newestInstanceDate: d };
  }

  // Pull newest-first; stop once we page past `floor` (incremental watermark, or
  // DLD_SINCE for a bounded demo seed). ISO dates compare lexicographically.
  let floor = process.env.DLD_SINCE || null;
  if (mode === 'incremental') {
    const { data } = await sb.from('ingestion_runs')
      .select('max_instance_date').order('id', { ascending: false }).limit(1).maybeSingle();
    floor = data?.max_instance_date ?? floor;
  }

  let page = 1, upserted = 0, maxDate = null;
  for (;;) {
    const rows = await fetchPage(token, { page, pageSize: 1000, filter: BASE_FILTER, order_by: 'instance_date', order_dir: 'desc' });
    if (!rows.length) break;
    upserted += await upsertBatch(sb, rows);
    for (const r of rows) if (r.instance_date && (!maxDate || r.instance_date > maxDate)) maxDate = r.instance_date;
    const oldest = rows[rows.length - 1]?.instance_date;
    process.stdout.write(`\r  page ${page} · upserted ${upserted}${floor ? ` · at ${oldest}` : ''}   `);
    if (floor && oldest && oldest < floor) break;   // crossed the floor
    if (rows.length < 1000) break;
    page++;
    await new Promise(res => setTimeout(res, 1100)); // stay under 60 req/min
  }
  process.stdout.write('\n');
  await sb.from('ingestion_runs').insert({ mode, status: 'ok', rows_upserted: upserted,
    max_instance_date: maxDate, finished_at: new Date().toISOString() });
  return { rowsUpserted: upserted, maxInstanceDate: maxDate };
}

// AWS Lambda entrypoint (later cloud automation).
export const handler = async (event = {}) => run(event.mode || 'probe');

// Local CLI: `node index.mjs probe|backfill|incremental`
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv[2] || 'probe')
    .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}
