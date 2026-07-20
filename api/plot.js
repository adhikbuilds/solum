// Solum · fetch DDA plot details by plot number.
// Runs server-side (Vercel function) so the browser never calls gis.dda.gov.ae
// directly — no CORS, and it works behind locked-down / isolation browsers since
// the page only ever talks to its own origin. Returns the raw ArcGIS attributes;
// the frontend maps them to fields (so mapping can change without a redeploy here).

const LAYER = 'https://gis.dda.gov.ae/server/rest/services/DDA/BASIC_LAND_BASE/MapServer/2/query';

module.exports = async (req, res) => {
  const number = String((req.query && req.query.number) || '').trim();
  if (!/^\d{4,10}$/.test(number)) {
    res.status(400).json({ error: 'Enter a valid plot number (4–10 digits).' });
    return;
  }
  const params = new URLSearchParams({
    where: `PLOT_NUMBER='${number}'`,   // number is digits-only above, so this is safe
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const r = await fetch(`${LAYER}?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Solum plot lookup)' },
    });
    if (!r.ok) { res.status(502).json({ error: `DDA responded ${r.status}.` }); return; }
    const data = await r.json();
    if (data && data.error) { res.status(502).json({ error: 'DDA rejected the request.' }); return; }
    const feat = data && Array.isArray(data.features) && data.features[0];
    if (!feat || !feat.attributes) {
      res.status(404).json({ error: `No plot ${number} found in the DDA register.` });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ attributes: feat.attributes });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach the DDA register. Try again in a moment.' });
  }
};
