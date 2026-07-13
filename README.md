# 🎒 Backpacker Buddy

Backpacker Buddy turns "I want to go everywhere on almost nothing" into a real plan. Give it your budget and your dream destinations, and it serves up the smartest flights, the best hostels, and the routes that tie them together — prioritizing flexible cancellation so your plans stay as free as you are. Less time planning, more time gone.

It's a zero-dependency static web app that acts as your personal budget travel agent — worldwide, with extra-deep coverage of the **California ↔ Australia ↔ Southeast Asia** circuit.

## Features

- **✈️ Flights** — Search any two places on Earth. Curated deal intelligence for 30+ budget routes (Jetstar, AirAsia, VietJet, Scoot, Cebu Pacific and friends): typical sale fares, which airlines fly the route cheapest, and route-specific hacks — plus regional budget-carrier intel for Europe, Latin America, South Asia and East Asia. One click opens live prices for your exact dates on Google Flights, Skyscanner, and Kiwi.com.
- **🛏️ Stays** — Per-city price intel for hostels, guesthouses, budget hotels and Airbnbs across ~50 backpacker hubs worldwide, with neighbourhood recommendations, a "clean & comfy" review-filter formula, a **free-cancellation-only** toggle, and pre-filtered searches on Hostelworld, Booking.com, Agoda, and Airbnb (any city works, even without curated intel).
- **🗺️ Route Planner** — Two modes. **Build your dream route:** list any countries you want to visit (from a ~50-country knowledge base with gateway airports, coordinates, and daily costs) and it orders them to minimise backtracking (nearest-neighbour + 2-opt), decides leg-by-leg whether a bus beats a plane, estimates every fare from a distance + regional-carrier price model, splits your days across countries, and checks the total against your budget — with pace warnings and "biggest lever" advice when it doesn't fit. **Or steal a classic:** six field-tested route strategies across Australia+SEA, Latin America, South Asia and Europe with leg-by-leg costs, ranked cheapest-first for your trip length, style and budget.
- **💡 Deal Hacks** — A featured **"Stay flexible"** guide (how to book flights and beds you're allowed to cancel — the backpacker's superpower) plus the evergreen playbook: sale calendars, carry-on math, land-vs-air rules of thumb, visa costs, seasonal timing, and hidden card fees.

## Running it

No build step, no dependencies. Either:

```bash
# open the file directly
open index.html            # macOS
xdg-open index.html        # Linux

# …or serve it locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

It's a plain static site, so it deploys anywhere (GitHub Pages, Netlify, Vercel) as-is.
A GitHub Pages workflow is included (`.github/workflows/pages.yml`) — enable it once under
**Settings → Pages → Source: GitHub Actions** and every push deploys the site automatically.

## How pricing works

Fare and accommodation figures are **planning estimates** based on budget-carrier sale history and typical low-season pricing — they help you judge what a *good* price looks like. Every result links out to live searches pre-filled with your dates, so real-time prices are always one click away. No API keys required.

## Live prices in-page (optional)

Want actual live fares and hotel rates rendered inside the Flights and Stays tabs? The repo ships a tiny Cloudflare Worker (`workers/`) that proxies a travel-data API — your token lives only in the worker's secrets, never in the page, the repo, or anyone's browser. Two providers are supported (the worker auto-detects whichever token you set):

- **Travelpayouts** (recommended) — free for individuals, one token powers both flights (real Aviasales fares with booking links) and hotels (Hotellook rates). Sign up at travelpayouts.com, join the Aviasales + Hotellook programs, and copy your API token from the profile page.
- **Duffel** (optional) — true real-time bookable flight offers; searching is effectively free at personal scale (they charge per booking). If both tokens are set, flight searches query **both providers in parallel** and merge the results cheapest-first, each fare badged "live" (Duffel) or "recent" (Aviasales) — Duffel is strongest on full-service and NDC fares, Aviasales on low-cost carriers, so together they give the widest coverage. Hotels always come from Travelpayouts/Hotellook.

> ⚠️ The original integration targeted the Amadeus Self-Service API, but Amadeus shut down self-service for new registrations in July 2026 — hence the providers above.

1. **Get a token** — travelpayouts.com (free) and/or duffel.com.
2. **Deploy the worker** (free Cloudflare account):
   ```bash
   cd workers
   npx wrangler deploy
   npx wrangler secret put TRAVELPAYOUTS_TOKEN   # paste token when prompted
   # and/or: npx wrangler secret put DUFFEL_API_KEY
   ```
3. **Connect the site** — open Backpacker Buddy, expand "⚡ Live prices" in the footer, paste your worker URL (e.g. `https://backpacker-buddy-api.you.workers.dev`), and hit Save. The site health-checks the worker and, from then on, flight searches show live fares and city searches show live hotel rates — falling back to the regular search links whenever the API is unavailable.

Responses are edge-cached (2 h flights, 6 h hotels) so free quotas stretch far. Hostels don't appear in hotel APIs — Hostelworld links remain the hostel path.

## Project layout

```
index.html          app shell (tabs: Flights / Stays / Routes / Deal Hacks)
css/styles.css      styling, light + dark mode
js/data.js          route deals, corridor advice, city stay intel, route
                    strategies, country atlas for the route builder
js/app.js           search logic, deep-link builders, route planning + builder
js/live.js          optional live-prices client (talks to the worker)
workers/worker.js   Cloudflare Worker: Amadeus proxy with caching + CORS
```
