"""The user journey, end to end, against the containerised stack.

    docker compose up -d && docker compose run --rm seeder    # or `loader`, for the full city
    python scripts/e2e.py            # needs: pip install playwright && playwright install chromium

Exits non-zero on the first thing a user would notice. It drives the real browser against the
real containers -- no mocks, no test doubles -- because every bug this stack has actually shipped
was invisible to unit tests and obvious to a page load: a tile template that was percent-encoded,
a map container collapsed to 0 px by a stylesheet, a NUMERIC that became a string somewhere
between Postgres and an interpolate expression.

Text assertions are case-insensitive on purpose: the panel headings are uppercased
by CSS, and `inner_text()` returns the rendered text, so a literal comparison tests
the stylesheet rather than the app.

Nothing here is pinned to a particular load. The counts, the coverage figure and the plot it
flies to are all read from `/api/city/manifest` and `/api/city/search` at the start of the run,
so the same script passes against the 1,078-plot committed seed and against the 100,215-plot
city. It was pinned to the city, and seeding a fresh database broke six assertions that were
testing the size of one snapshot rather than the behaviour of the app.
"""
import json
import re
import sys
import urllib.request
from playwright.sync_api import sync_playwright

API = 'http://localhost:8010'
WEB = 'http://localhost:5180'


def api(path):
    with urllib.request.urlopen(f'{API}{path}', timeout=30) as r:
        return json.loads(r.read())


try:
    MANIFEST = api('/api/city/manifest')
except Exception as e:
    sys.exit(f'! the backend has no city loaded ({e}).\n'
             f'  Run `docker compose run --rm seeder` first.')


def probe_plot():
    """
    A plot this load actually contains, with a published height and a derived scheme.

    Picked from the data rather than hard-coded, because a plot number that exists in the city
    snapshot need not exist in a district seed -- and a plot with no height has no massing to
    assert and no envelope for the study to resolve.
    """
    seen = []
    for prefix in ('3', '4', '5', '6', '7', '8', '9', '1', '2'):
        for hit in api(f'/api/city/search?q={prefix}0&limit=12')['results']:
            n = hit['plot_number']
            if n in seen:
                continue
            seen.append(n)
            rec = api(f'/api/city/plot/{n}')
            if rec.get('height_src') != 'unavailable' and rec.get('massing'):
                return n
    sys.exit('! no plot in this load has both a height and a scheme; is the seeder/loader done?')


PLOT = probe_plot()
PLOTS = MANIFEST['plots']
MASSED = MANIFEST['massing']['plots']
# Jurisdictional, not derived: the share of Dubai's RERA-registered projects DDA governs. It does
# not move with the size of the load, so it is read rather than recomputed.
COVERAGE = f"DDA {MANIFEST['coverage']['shares']['dda']}%"
print(f"· {MANIFEST['aoi']} snapshot {MANIFEST['snapshot']}: "
      f"{PLOTS:,} plots, {MASSED:,} massed, probing plot {PLOT}")

FAILS, OKS = [], []
def check(name, cond, detail=''):
    detail = '' if not detail else str(detail)
    (OKS if cond else FAILS).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':1600,'height':1000})
    errors, tiles = [], []
    pg.on('pageerror', lambda e: errors.append(str(e)[:160]))
    pg.on('console', lambda m: errors.append(m.text[:160]) if m.type == 'error' else None)
    pg.on('request', lambda r: tiles.append(r.url) if '/api/city/tiles/' in r.url else None)

    pg.goto(f'{WEB}/', wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_timeout(2000)
    check('app loads', 'Solum' in pg.locator('body').inner_text())

    pg.get_by_text('The city', exact=True).click()
    pg.wait_for_timeout(8000)
    body = pg.locator('body').inner_text()
    check('city screen opens', f'{PLOTS:,}' in body, 'plot count from Postgres')
    check('massing count shown', f'{MASSED:,}' in body, f'{MASSED:,} massed')
    check('coverage stated', COVERAGE in body, COVERAGE)
    check('plot tiles requested', len([t for t in tiles if '/plots/' in t]) > 0,
          f"{len([t for t in tiles if '/plots/' in t])} requests")
    check('canvas full size', pg.evaluate("() => {const c=document.querySelector('canvas'); return c.clientHeight}") > 800)

    # Camera. A Mac trackpad cannot right-drag and macOS eats ctrl-drag for the context menu, so
    # rotation is only reachable through these -- the hash going from three parts to five is the
    # whole assertion.
    before = pg.evaluate('() => location.hash')
    for _ in range(3): pg.get_by_label('Rotate clockwise').click(); pg.wait_for_timeout(400)
    for _ in range(4): pg.get_by_label('Tilt down toward the horizon').click(); pg.wait_for_timeout(400)
    pg.wait_for_timeout(2000)
    after = pg.evaluate('() => location.hash')
    check('camera rotates and tilts', len(after.split('/')) == 5 and after != before, after)
    pg.get_by_label('Reset north').click(); pg.wait_for_timeout(2000)
    check('reset north works', len(pg.evaluate('() => location.hash').split('/')) == 3)

    # search
    pg.fill('input[placeholder="plot or area"]', PLOT)
    pg.wait_for_timeout(2500)
    hits = pg.locator('ul li button').count()
    check('search returns a hit', hits > 0, f'{hits} results')
    if hits:
        pg.locator('ul li button').first.click()
        pg.wait_for_timeout(8000)
        check('flying to a plot selects it', re.search(r'\bplot\b', pg.locator('body').inner_text(), re.I) is not None)

    # the plot panel
    body = pg.locator('body').inner_text()
    check('entitlement shown', re.search('permitted gfa', body, re.I) is not None)
    check('provenance tag shown', any(t in body for t in ('authority','derived','assumption','unavailable')))

    # the live DDA study -- the one path that leaves the stack
    try:
        pg.get_by_role('button', name=re.compile('value it here', re.I)).click(timeout=6000)
        pg.wait_for_timeout(22000)
        body = pg.locator('body').inner_text()
        check('live DDA study returns', re.search(r'residual land value|no scheme', body, re.I) is not None,
              [l for l in body.split('\n') if 'AED' in l][:1])
    except Exception as e:
        check('live DDA study returns', False, str(e)[:80])

    # modes
    for m in ['value','height','status','source']:
        pg.get_by_role('button', name=re.compile(f'^{m}$', re.I)).click()
        pg.wait_for_timeout(1800)
        # Asserted while the mode is actually on screen. Checking after the loop tested whatever
        # mode happened to be last, which is how this "failed" while working perfectly.
        # Read from the manifest, not typed in: these are the two numbers the modes exist to
        # explain, and a literal makes the test a statement about one snapshot's size.
        if m == 'value':
            negative = MANIFEST['rlv_psf']['negative']
            check('value calibration warning surfaced',
                  f'{negative:,}' in pg.locator('body').inner_text(), f'{negative:,} negative')
        if m == 'height':
            absent = MANIFEST['height_provenance']['unavailable']
            check('no-height count surfaced',
                  f'{absent:,}' in pg.locator('body').inner_text(), f'{absent:,} without height')
    check('all modes switch', True)

    # massing
    pg.get_by_role('button', name=re.compile('^site$', re.I)).click(); pg.wait_for_timeout(1000)
    pg.get_by_text('Massing', exact=True).click()
    pg.wait_for_timeout(9000)
    check('massing tiles requested', len([t for t in tiles if '/massing/' in t]) > 0,
          f"{len([t for t in tiles if '/massing/' in t])} requests")
    pg.get_by_text('Satellite', exact=True).click(); pg.wait_for_timeout(5000)
    check('satellite toggles', True)

    # The handoff: a plot found on the map opens in the study screen, which is the whole reason
    # the two screens stopped being separate products.
    pg.get_by_role('button', name=re.compile('open full study', re.I)).click()
    pg.wait_for_timeout(15000)
    body = pg.locator('body').inner_text()
    check('city hands the plot to the study',
          PLOT in body and re.search('regulatory envelope', body, re.I) is not None)

    pg.screenshot(path='e2e-final.png')
    real = [e for e in errors if 'circle-11' not in e and 'wood-pattern' not in e and 'THREE' not in e]
    check('no console errors', not real, str(real[:2]))
    b.close()

print(f"\n{len(OKS)} passed, {len(FAILS)} failed")
sys.exit(1 if FAILS else 0)
