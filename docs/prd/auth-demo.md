# PRD — Demo authentication (Supabase Auth)

- **Status:** Draft
- **Date:** 2026-07-18
- **Owner:** DKubadia
- **Related:** `PROJECT_CONTEXT.md` §6.7 (presentational login — this replaces it), §8 (real auth was parked); build lands with Phase 2 frontend work in `dld-comps-integration.md`.

---

## 1. Problem / why now

Solum is publicly deployed (Vercel) and now sits on real, licensed DLD data. The
current login is **presentational only** — any click enters the app (PROJECT_CONTEXT
§6.7). That's fine for a static artifact, wrong for a deployed webapp with a real
backend. We want a **proper** auth layer with **one shared demo credential**, done
right, and it retires the fake-login debt.

## 2. What it does (scope)

- **Real login** via **Supabase Auth** (email/password). One demo user
  (e.g. `demo@almizan.ae`). Successful sign-in → real JWT session → app opens.
- **Session persists** across refreshes; a session check on load decides
  login-screen vs. app (fixes the old "screen never hidden" flow properly).
- **Credentials pre-filled** on the login screen for easy demoing to Al Mizan —
  the user still submits through real Supabase Auth (pre-fill is convenience, not
  a bypass). The password is *not* hardcoded in app logic; it's just placeholder
  text in the input.
- **Gate the data, not just the UI.** Tighten RLS so comps require an
  authenticated session — the Supabase API returns nothing without a login, so
  the gate isn't just a front door with an open window.

## 3. Two layers (both required for "proper")

1. **UI gate** — no session → login screen; session → app. Handled by
   `supabase.auth.getSession()` on load + `onAuthStateChange`.
2. **Data gate (RLS)** — change the read policies from `using (true)` to
   `to authenticated using (true)` so only a valid session can read
   `dld_locations` / `dld_transactions` / `comps_aggregates`. The frontend's
   `supabase-js` client sends the session JWT automatically, so authed reads work;
   anonymous/public-key reads return empty.

> Note: DLD data is "Open" classification (not confidential), so this is good
> hygiene rather than a compliance need — but it's what doing it properly means.

## 4. Implementation (stays single-file)

In `solum.html`:
- Load `@supabase/supabase-js` from a CDN (consistent with how jsPDF/pdf.js already
  lazy-load). Init a client with the **publishable/anon** key (public, safe) + URL.
- Wire the existing login button → `supabase.auth.signInWithPassword({email, password})`.
  On error, show an inline message; on success, call the existing `enterApp()`.
- On load: `getSession()` → if a session exists, skip straight to the app.
- Add a **Sign out** action (session → clear → back to login).
- Comps fetches (Phase 2) go through the same authed `supabase-js` client, so they
  inherit the session and satisfy RLS.

## 5. Sequencing (important — avoid locking yourself out)

The RLS tightening and the frontend auth must ship **together**. If the RLS
migration (`0002_auth_rls.sql`) is pushed before the frontend can authenticate,
every read (including the current app) breaks. So:
1. Build the frontend auth in `solum.html` (Phase 2).
2. Create the demo user in Supabase (dashboard).
3. Only then add + push the RLS migration flipping policies to `authenticated`.

This PRD therefore does **not** ship a migration yet — that's a Phase 2 step.

## 6. Out of scope

Multi-user / sign-up / password reset / SSO / roles — this is one shared demo
credential. Per-tenant auth is a real-product concern (PROJECT_CONTEXT §7), not the
demo. No email verification (the demo user is created verified in the dashboard).

## 7. Acceptance check

- Visiting the Vercel URL shows the login screen; the app is not reachable without
  signing in.
- Pre-filled demo creds → **Sign in** → app opens; refresh keeps you in; **Sign out**
  returns to login.
- Hitting the Supabase REST API with only the public key returns **no rows**
  (RLS enforced); with a valid session, comps come back.
- `solum.html` structural checks still pass (token graph, blue-swap acid test, JS
  syntax, tag balance).
