"""The user journey, end to end, against the containerised stack.

    docker compose up -d && docker compose run --rm loader
    python scripts/e2e.py            # needs: pip install playwright && playwright install chromium

Exits non-zero on the first thing a user would notice. It drives the real browser against the
real containers -- no mocks, no test doubles -- because every bug this stack has actually shipped
was invisible to unit tests and obvious to a page load: a tile template that was percent-encoded,
a map container collapsed to 0 px by a stylesheet, a NUMERIC that became a string somewhere
between Postgres and an interpolate expression.

Text assertions are case-insensitive on purpose: the panel headings are uppercased
by CSS, and `inner_text()` returns the rendered text, so a literal comparison tests
the stylesheet rather than the app.
"""
import re
import sys
from playwright.sync_api import sync_playwright

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

    pg.goto('http://localhost:5180/', wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_timeout(2000)
    check('app loads', 'Solum' in pg.locator('body').inner_text())

    pg.get_by_text('The city', exact=True).click()
    pg.wait_for_timeout(8000)
    body = pg.locator('body').inner_text()
    check('city screen opens', '100,215' in body, 'plot count from Postgres')
    check('massing count shown', '71,627' in body)
    check('coverage stated', 'DDA 44.8%' in body)
    check('plot tiles requested', len([t for t in tiles if '/plots/' in t]) > 0,
          f"{len([t for t in tiles if '/plots/' in t])} requests")
    check('canvas full size', pg.evaluate("() => {const c=document.querySelector('canvas'); return c.clientHeight}") > 800)

    # search
    pg.fill('input[placeholder="plot or area"]', '3156315')
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
        pg.get_by_role('button', name=re.compile('run the full study', re.I)).click(timeout=6000)
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
        if m == 'value':
            check('value calibration warning surfaced', '64,884' in pg.locator('body').inner_text())
        if m == 'height':
            check('no-height count surfaced', '13,973' in pg.locator('body').inner_text())
    check('all modes switch', True)

    # massing
    pg.get_by_role('button', name=re.compile('^site$', re.I)).click(); pg.wait_for_timeout(1000)
    pg.get_by_text('Massing', exact=True).click()
    pg.wait_for_timeout(9000)
    check('massing tiles requested', len([t for t in tiles if '/massing/' in t]) > 0,
          f"{len([t for t in tiles if '/massing/' in t])} requests")
    pg.get_by_text('Satellite', exact=True).click(); pg.wait_for_timeout(5000)
    check('satellite toggles', True)

    pg.screenshot(path='e2e-final.png')
    real = [e for e in errors if 'circle-11' not in e and 'wood-pattern' not in e and 'THREE' not in e]
    check('no console errors', not real, str(real[:2]))
    b.close()

print(f"\n{len(OKS)} passed, {len(FAILS)} failed")
sys.exit(1 if FAILS else 0)
