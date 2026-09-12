"""
One command that serves the DISTRICT and answers questions about it.

The city is not here any more. It moved to Postgres and to the one backend in `service/`, and
this app is now what its name always said it was: a single baked district, drawn by three.js at
`viewer.html`, plus the appraisal behind any parcel in it. The city map is a React route in
`web/` talking to `/api/city/*`.

    python -m solum_city.web.serve        # city.html (the emirate) and viewer.html (one district)

Two surfaces, deliberately small:

  `/`                          the baked district, its manifest, reports and the viewer, as files
  `/api/twin/appraise/{plot}`  the semantic join -- a plot id resolved to its own appraisal

The appraisal endpoint lives here rather than in `service/main.py` so the city base stays one
self-contained thing that can be run, moved or deleted without touching the study service. It
calls the same pure modules that service does, so there is one appraisal in this repo, not two.
"""

from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from solum_city.web.study import appraise_plot

STATIC = Path(__file__).resolve().parent / 'static'
OUT = Path(__file__).resolve().parents[1] / 'out'

app = FastAPI(
    title='Solum city base',
    description='A baked district, and the appraisal behind any parcel in it',
    version='0.1.0',
)

@app.get('/api/twin/appraise/{plot_number}')
def appraise(plot_number: str, optimistic: bool = False) -> dict:
    """
    Resolve a rendered parcel to its residual land value.

    `optimistic=true` sizes the envelope against the smallest published setback instead of the
    largest -- the two bound the answer while DDA's side assignment is unresolved.
    """
    try:
        return appraise_plot(plot_number, conservative=not optimistic)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:                       # network, upstream shape changes
        raise HTTPException(502, f'DDA lookup failed: {e}') from e

# Two mounts, because the baked district and the page that draws it are different things: one is
# generated output that a rebuild replaces, the other is source. Mounted last so the API wins.
app.mount('/out', StaticFiles(directory=str(OUT)), name='district')
app.mount('/', StaticFiles(directory=str(STATIC), html=True), name='viewer')

def main() -> int:
    print('· city     http://127.0.0.1:8081/city.html')
    print('· district http://127.0.0.1:8081/viewer.html')
    uvicorn.run(app, host='127.0.0.1', port=8081, log_level='warning')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
