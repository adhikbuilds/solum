/**
 * The interface: palettes, panels, legend, search, and the bootstrap.
 *
 * What the reader sees and clicks. It owns the question each mode asks and the colour
 * that answers it; `scene.js` owns how that answer is drawn. The file ends with the
 * one fetch that starts everything.
 */

const PARAMS = new URLSearchParams(location.search);

const AOI = PARAMS.get('aoi') || 'dhcc-phase-1';
// `?imagery=off` or `?imagery=<n>` caps the ground tiles. 156 tiles is right for a real browser
// on a real connection and wrong for a slow link or an automated capture, where a stalled tile
// queue is indistinguishable from a broken scene.

const IMAGERY_CAP = PARAMS.get('imagery') === 'off' ? 0
  : PARAMS.has('imagery') ? Math.max(0, parseInt(PARAMS.get('imagery'), 10) || 0) : Infinity;

// Colour is never decorative here. 'site' is the only mode that tries to look like a city; each
// other palette answers one question, and the legend names the question.

const PALETTE = {
  status: {
    'Completed': '#8A7F74', 'Under Construction': '#FF6B19', 'Pre-Construction': '#E0A030',
    'Empty': '#C9BFB4', 'Suspended': '#A8524A', 'unstated': '#D6CEC5',
  },
  provenance: {
    authority: '#1E7A43', derived: '#3B5C8A', assumption: '#C77A1E', unavailable: '#B9AEA3',
  },
  landuse: {},   // filled from the data: land use is open-ended, unlike the two above
};

const LANDUSE_RAMP = ['#3B5C8A','#1E7A43','#C77A1E','#8A4E8F','#A8524A','#2E7D8A','#7A6A3D','#8A7F74'];
// A sequential ramp for money, plus one colour outside it. A plot whose best scheme does not
// clear the hurdle has a negative residual -- that is not "cheap land", it is a different answer,
// so it gets slate rather than the pale end of the ramp where it would read as merely low.

const VALUE_RAMP = ['#F3E3D2', '#E6BE93', '#D6934F', '#BE6A24', '#95430F', '#63290A'];

const VALUE_NEGATIVE = '#66788A';

const VALUE_NONE = '#CFC7BE';

function valueColour(p) {
  const v = p.value && p.value.rlv_psf_land;
  if (v == null) return VALUE_NONE;
  if (v < 0) return VALUE_NEGATIVE;
  const [lo, hi] = VALUE_SCALE;
  const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
  return VALUE_RAMP[Math.min(VALUE_RAMP.length - 1, Math.floor(t * VALUE_RAMP.length))];
}

let VALUE_SCALE = [0, 1];

const fmt = (n, d = 0) => n == null ? '—'
  : Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});

const money = n => n == null ? '—'
  : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B'
  : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M'
  : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'K' : String(Math.round(n));

// Geometry arrives as parts, each [exterior, ...holes]. The nesting is the point: a flat list
// cannot say whether ring two is a courtyard or a second piece of the same parcel, and guessing
// "hole" punches a void through a building.

function colourOf(p) {
  if (mode === 'value') return valueColour(p);
  if (mode === 'provenance') return PALETTE.provenance[p.height_provenance] || '#B9AEA3';
  if (mode === 'landuse') return PALETTE.landuse[p.landuse || 'unstated'] || '#B9AEA3';
  return PALETTE.status[p.status || 'unstated'] || PALETTE.status.unstated;
}

function buildLandusePalette(parcels) {
  const counts = {};
  parcels.forEach(p => { const k = p.landuse || 'unstated'; counts[k] = (counts[k] || 0) + 1; });
  Object.keys(counts).sort((a, b) => counts[b] - counts[a])
    .forEach((k, i) => PALETTE.landuse[k] = LANDUSE_RAMP[i % LANDUSE_RAMP.length]);
}

/**
 * Storey banding, drawn once into a canvas and shared by every wall.
 *
 * At LOD1 a facade has no data behind it, so this is deliberately not a texture pretending to be
 * one: it is a floor line every 3.2 m -- the same floor-to-floor the heights were derived from --
 * which gives the eye a scale reference and nothing more. A photographic facade here would be the
 * mistake the guide warns about: visual realism implying data that does not exist.
 */

/** Materials for the entitlement layer -- art-directed in site mode, flat and legible elsewhere. */

/**
 * Materials for what is standing.
 *
 * Massing reads by scale -- sand low-rise, paler mid-rise, cooler glassier towers -- which is the
 * LOD1 half of the guide's typology stage, done from the attributes actually present rather than
 * from a rule table fitted to fields nobody populates. A footprint with no recorded height is a
 * pad in a flatter tone: visibly not a building, because we do not know that it is one.
 */

/**
 * Which layer answers the current question.
 *
 * Site mode is the city: real footprints, with entitlement kept as a faint ghost only where
 * nothing is standing -- so a pale volume always means "this is what may be built here, and
 * nothing is". Every analytical mode drops the as-built layer entirely, because those questions
 * are about the parcel and its regulation, and a surveyed roof in front of the answer is noise.
 */

/**
 * The satellite ground.
 *
 * Each tile arrives with its four corners already in the local plan frame, converted back out of
 * Web Mercator by the pipeline. The browser does no projection maths: it draws a quad on the
 * corners it was given. That is the direction the conversion has to run -- imagery fitted to the
 * model, never the model fitted to the imagery.
 */

/** A warm dusty horizon rather than a flat colour -- Dubai's air is never empty. */

function legend() {
  const el = document.getElementById('legend');
  const title = document.getElementById('legend-title');
  const b = district.buildings || [];

  if (mode === 'site') {
    title.textContent = 'What is standing';
    const rows = [
      ['Surveyed height (OSM)', '#D2C7B7', b.filter(x => (x.height_source || '').startsWith('osm')).length],
      ['At the plot ceiling', '#C9BFAF', b.filter(x => x.height_source === 'dda:permitted').length],
      ['Shape only, drawn flat', '#CFC6BA', b.filter(x => !x.height_m).length],
      ['Permitted, nothing built', '#F0E9DF',
        district.parcels.filter(p => !b.some(x => x.plot_id === p.id)).length],
    ];
    el.innerHTML = rows.map(([k, c, n]) =>
      `<div class="lg"><i class="sw" style="background:${c}"></i>${k}<span class="n">${n}</span></div>`).join('');
    return;
  }

  if (mode === 'value') {
    title.textContent = 'Residual land value · AED per sqft of land';
    const [lo, hi] = VALUE_SCALE;
    const neg = district.parcels.filter(p => p.value && p.value.rlv_psf_land < 0).length;
    const none = district.parcels.filter(p => !p.value || p.value.rlv_psf_land == null).length;
    const hyp = district.parcels.filter(p => p.value && p.value.hypothetical && p.value.rlv_psf_land != null).length;
    el.innerHTML = `
      <div style="display:flex;height:12px;border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,.12)">
        ${VALUE_RAMP.map(c => `<i style="flex:1;background:${c}"></i>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font:500 11px/1 'DM Mono',monospace;color:var(--muted);margin-top:5px">
        <span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>
      <div class="lg" style="margin-top:8px"><i class="sw" style="background:${VALUE_NEGATIVE}"></i>
        Does not clear the hurdle<span class="n">${neg}</span></div>
      <div class="lg"><i class="sw" style="background:${VALUE_NONE}"></i>
        Withheld — no GFA or no storey limit<span class="n">${none}</span></div>
      <div class="note">${hyp} of the priced parcels are published as a non-residential use. The
        engine prices a residential schedule, so those read as “what this land would be worth under
        a residential scheme of the permitted size”, not as a valuation of what is there.</div>`;
    return;
  }

  const counts = {};
  district.parcels.forEach(p => {
    const k = mode === 'provenance' ? p.height_provenance
            : mode === 'landuse' ? (p.landuse || 'unstated') : (p.status || 'unstated');
    counts[k] = (counts[k] || 0) + 1;
  });
  title.textContent = mode === 'provenance' ? 'Where each height came from'
    : mode === 'landuse' ? 'Land use (DDA)' : 'Construction status (DDA)';
  el.innerHTML = Object.keys(counts).sort((a, b2) => counts[b2] - counts[a]).slice(0, 9).map(k => {
    const c = mode === 'provenance' ? PALETTE.provenance[k]
            : mode === 'landuse' ? PALETTE.landuse[k]
            : PALETTE.status[k] || PALETTE.status.unstated;
    return `<div class="lg"><i class="sw" style="background:${c}"></i>${k}<span class="n">${counts[k]}</span></div>`;
  }).join('');
}

function select(u) {
  if (schemeGroup) { scene.remove(schemeGroup); schemeGroup = null; }
  picked = u;
  rebuildMaterials();
  const el = document.getElementById('sel');
  const card = document.getElementById('right');
  if (!u || !(u.parcel || u.building)) { card.hidden = true; el.innerHTML = ''; return; }
  card.hidden = false;
  const p = u.parcel, b = u.building;

  if (b) {
    // A surveyed structure. Its own facts first, then the plot it stands on, because the
    // regulation and the money belong to the plot rather than to the building.
    const rows = [
      ['Name', b.name || '—'],
      ['Type', b.kind || 'building'],
      ['Footprint', fmt(b.area_sqm) + ' sqm'],
      ['Height', b.height_m ? fmt(b.height_m, 1) + ' m' : 'not surveyed'],
      ['On plot', b.plot_id || 'no DDA parcel'],
    ];
    el.innerHTML = `
      <h2>${b.name || 'Structure'}</h2>
      <div class="sub">OSM ${b.id}</div>
      <dl style="margin-top:8px">${rows.map(([k, v]) =>
        `<div class="row"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="note">Height source: ${b.height_source}
        <span class="tag t-${b.height_provenance}">${b.height_provenance}</span><br>${b.height_basis}</div>
      ${p ? `<button class="btn" id="appraise">Appraise plot ${p.id}</button><div id="study"></div>` : ''}`;
    if (p) document.getElementById('appraise').addEventListener('click', () => appraise(p));
    return;
  }

  const v = p.value || {};
  const rows = [
    ['Land', p.name || '—'],
    ['Use', p.landuse || '—'],
    ['Status', p.status || '—'],
    ['Plot area', fmt(p.area_sqm) + ' sqm'],
    ['Permitted GFA', p.gfa_sqm ? fmt(p.gfa_sqm) + ' sqm' : '—'],
    ['Storeys', p.floors ?? '—'],
    ['Height', p.height_m ? fmt(p.height_m, 1) + ' m' : 'not published'],
  ];
  el.innerHTML = `
    <h2>Plot ${p.id}</h2>
    <div class="sub">${p.project || ''}</div>
    <dl style="margin-top:8px">${rows.map(([k, x]) =>
      `<div class="row"><dt>${k}</dt><dd>${x}</dd></div>`).join('')}</dl>
    <div class="note">Height source: ${p.height_source || 'none'}
      <span class="tag t-${p.height_provenance}">${p.height_provenance}</span><br>${p.height_basis}</div>
    ${v.rlv != null ? `
      <div class="rlv">
        <div class="k">Residual land value · district pass</div>
        <div class="v">AED ${money(v.rlv)}</div>
        <div class="s">${fmt(v.rlv_psf_land, 0)} per sqft of land · ${v.floors} storeys ·
          ${fmt(v.units)} units · binding: ${v.binding_constraint}${v.hypothetical ? ' · hypothetical use' : ''}</div>
      </div>` : `<div class="note">No value: ${v.basis || 'not appraised'}</div>`}
    <button class="btn" id="appraise">Re-run the full study</button>
    <div id="study"></div>`;
  document.getElementById('appraise').addEventListener('click', () => appraise(p));
}

/**
 * The semantic join: a rendered parcel resolves to its own appraisal.
 *
 * This is the whole reason the twin sits inside Solum rather than beside it. The id on screen is
 * the DDA plot number -- the authority's key, not an index into our output -- so the same id runs
 * the study path: published envelope, buildable envelope, massing candidates, residual land value.
 */

function appraise(p) {
  const btn = document.getElementById('appraise');
  const out = document.getElementById('study');
  btn.disabled = true; btn.textContent = 'appraising…';
  fetch(`/api/twin/appraise/${p.id}`)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(a => {
      btn.remove();
      drawScheme(p, a.geometry);
      if (a.verdict === 'withheld') {
        out.innerHTML = `<div class="rlv"><div class="k">Withheld</div>
          <div class="s">${a.why}</div></div>`;
        return;
      }
      out.innerHTML = `
        <div class="rlv">
          <div class="k">Residual land value · ${a.setback_bound} bound</div>
          <div class="v">AED ${money(a.money.residual_land_value)}</div>
          <div class="s">${fmt(a.money.rlv_psf_land, 0)} per sqft of land · GDV AED ${money(a.money.gdv)}
            · ${a.scheme.floors} storeys · ${fmt(a.scheme.total_units)} units
            · binding: ${a.scheme.binding_constraint}</div>
        </div>
        <div class="note">${a.district_is_scenery}</div>`;
    })
    .catch(() => {
      btn.disabled = false; btn.textContent = 'Appraise this plot';
      out.innerHTML = '<div class="note">Live appraisal needs the study service — this page is static. ' +
        'Run <code>python -m twin.web.serve</code> locally and the button re-runs the full ' +
        'study against DDA. The district pass above is already baked in.</div>';
    });
}

/** Shoelace centroid of a ring, so a scheme lands on its plot rather than on the plot's bounding box. */

/**
 * The solved scheme, standing where it would stand.
 *
 * The district's own massing for this plot is a fast derivation -- permitted GFA over permitted
 * storeys. This is the study's answer: setbacks inset from the real parcel edges, a plate fitted
 * to the site's dominant axis, one slab per storey. Drawn in the accent colour and translucent,
 * because it is a proposal sitting inside a district of things that exist.
 */

/**
 * Solar position, in the browser, for any hour of the district's own day.
 *
 * The same NOAA algorithm the pipeline runs (`twin/sun.py`), ported rather than approximated: a
 * slider that lerped between two baked directions would move the shadows smoothly and put them in
 * places the sun never occupies. The pipeline's own figure for 15:00 is the check -- drag the
 * slider back to 15:00 and it lands on 242° / 45°, which is what the panel prints.
 */

/** Move the sun to a given local hour, and warm it as it drops -- the light a low sun actually is. */

function chrome() {
  const st = manifest.stats;
  const sun = district.sun;
  document.getElementById('where').textContent =
    `${district.aoi.name} · ${st.kept} parcels · EPSG:${district.crs} · basis: ${district.basis}`;

  // The ramp is scaled to this district's own spread rather than to a fixed national range, so
  // the colours separate the parcels actually on screen. The endpoints are printed on the legend.
  const psf = st.rlv_psf_land || {};
  VALUE_SCALE = [Math.max(0, psf.min ?? 0), psf.max ?? 1];

  const kpi = [
    ['Standing (OSM)', `${st.built_count || 0}`],
    ['Massed from DDA', `${st.solid}/${st.kept}`],
    ['Priced', `${st.priced || 0}`],
    ['Withheld', `${st.withheld || 0}`],
    ['Tallest', fmt(st.tallest_m, 0) + ' m'],
    ['Permitted GFA', fmt(Math.round((st.total_gfa_sqm || 0) / 1000)) + 'k sqm'],
    ['Ground', `${manifest.vertical.model} @ ${manifest.vertical.ground_elevation_m} m`],
    ['Imagery', `z${district.imagery.zoom} · ${district.imagery.resolution_m_px} m/px`],
  ];
  document.getElementById('stats').innerHTML = kpi.map(([k, v2]) =>
    `<div><dt>${k}</dt><dd>${v2}</dd></div>`).join('');
  document.getElementById('basis').textContent = manifest.basis_statement;
  document.getElementById('attr').innerHTML =
    district.attribution.map(a => `<div>${a}</div>`).join('') +
    `<div>Snapshot ${manifest.snapshot.fetched_on} · sun computed for ${sun.date} at ` +
    `${sun.lat.toFixed(3)}°N ${sun.lon.toFixed(3)}°E</div>`;

  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('#modes button').forEach(o =>
      o.setAttribute('aria-pressed', String(o === b)));
    rebuildMaterials();
  }));

  document.getElementById('close').addEventListener('click', () => select(null));

  const hour = document.getElementById('hour');
  hour.addEventListener('input', () => setHour(parseFloat(hour.value)));
  setHour(parseFloat(hour.value));

  // Search: a plot number is the district's own key, so typing one is the same lookup the
  // renderer, the study service and DDA itself all use.
  const find = document.getElementById('find');
  find.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const p = byPlot[find.value.trim()];
    if (!p) { find.value = ''; find.placeholder = 'no such plot here'; return; }
    select({parcel: p, layer: 'permitted'});
    const [cx, cy] = centroidOf(p.plot[0][0]);
    ORBIT.flyTo(cx, -cy, Math.max(180, Math.sqrt(p.area_sqm || 4000) * 4));
  });
}

Promise.all([
  fetch(`../../out/${AOI}/district.json`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
  fetch(`../../out/${AOI}/manifest.json`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
]).then(([d, m]) => {
  district = d; manifest = m;
  buildLandusePalette(d.parcels);
  init();
  chrome();
  legend();
}).catch(() => { document.getElementById('err').style.display = 'block'; });
