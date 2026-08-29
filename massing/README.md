# Massing engine

Parcel geometry and regulatory limits → buildable envelope → massing candidates.

Built on top of DKubadia's prototype (`prototype/main`, 91 commits) — this is additive, and
touches nothing in `solum.html`.

## The finding that shaped this

The roadmap assumed regulatory encoding would be the hard part: hand-build zoning tables per
zone, get a domain expert to validate them, and accept that a misread setback silently produces
confidently wrong feasibility numbers.

**For DDA plots that is not the situation.** The DDA parcel layer publishes, per plot:

| Field | Example (plot 3156315) |
|---|---|
| `AREA_SQFT` / `GFA_SQFT` | 204,460 / 408,717 → FAR **derived** as 2.0, not assumed |
| `MAX_HEIGHT_FLOORS` | `G+8` → 9 storeys |
| `BUILDING_SETBACK_SIDE1..4` | 20, 10, 10, 10 m |
| `MAX_PLOT_COVERAGE`, `LANDUSE_DETAILS` | published |
| `GENERAL_NOTES` | *"ONE BAY PER EVERY 50 SQ.M OF THE GFA"* |

So we read the regulation instead of encoding it, and every field carries a `Provenance`
(`authority` / `derived` / `assumption` / `unavailable`). No zoning rule table is needed for v1.

**Coverage** (measured against the RERA project register, 3,039 projects, 2026-08-29):
DDA **44.8%**, Trakhees 30.4%, Dubai Municipality 18.1%, Dubai South 4.2%, DSO 2.4%.
This path covers a little under half of Dubai directly. The rest needs another source — a
known gap, surfaced as `Provenance.UNAVAILABLE` rather than papered over.

## The one real ambiguity

DDA publishes four setbacks named SIDE1..SIDE4 but never says which polygon edge each applies
to — and a real parcel is not a rectangle (the reference plot has 37 vertices). Guessing the
assignment produces a number that looks authoritative and is not.

So `envelope.py` refuses to guess and returns a **bounded range**: every edge inset by the
largest published setback (conservative) and by the smallest (optimistic). The truth lies
between them whatever the real assignment is.

This costs less than it sounds: above ~5 floors the **published GFA ceiling binds before the
envelope does**, so the ambiguity does not change achievable GFA at all for mid-rise and up.
It only costs precision on low-rise. That is pinned in
`test_gfa_ceiling_binds_before_the_envelope_for_taller_schemes`.

## Why there is no solver

Permitted GFA is *published*, not discovered. That collapses the search: for any floor count the
optimal footprint is determined (`permitted GFA / floors`, capped by the envelope), so the
candidate set is at most `max_floors` entries, each exactly optimal. OR-Tools and genetic search
are machinery for exploring a space we can enumerate in microseconds.

(The first cut swept footprint on a 12-step grid and topped out at 95.8% of entitlement — a
pure gridding artefact that would read to a developer as "this plot cannot be fully used.")

## Layout

```
solum_massing/dda.py       fetch + parse the regulatory envelope, provenance-tagged
solum_massing/envelope.py  parcel − setbacks → buildable envelope (shapely, wkid 3997)
solum_massing/massing.py   deterministic (footprint, floors) candidates
tests/                     11 tests
fixtures/                  one real DDA parcel, so tests need no network
```

`wkid 3997` is Dubai Local Transverse Mercator — **projected, in metres** — so setbacks buffer
directly with no reprojection.

## Run

```sh
python3 -m venv .venv-massing
./.venv-massing/bin/pip install -r massing/requirements.txt pytest
./.venv-massing/bin/python -m pytest massing/tests -q
```

## Not built yet

- Trakhees / DM / Dubai South plots (55% of the register) — no setback source identified
- Wiring candidates into `evalMix()` in `solum.html` for pricing
- Unit-mix allocation per candidate. The RERA register gives a real benchmark to validate
  against: 1BR 34.6%, 2BR 21.6%, 3BR 13.0%, studio 12.9%, 4BR 10.0% across 118,221 units
- 3D view, DXF export
