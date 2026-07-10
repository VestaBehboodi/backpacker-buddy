# 🎒 Backpacker Buddy

Backpacker Buddy turns "I want to go everywhere on almost nothing" into a real plan. Give it your budget and your dream destinations, and it serves up the smartest flights, the best hostels, and the routes that tie them together — prioritizing flexible cancellation so your plans stay as free as you are. Less time planning, more time gone.

It's a zero-dependency static web app that acts as your personal budget travel agent for the **California ↔ Australia ↔ Southeast Asia** backpacking circuit.

## Features

- **✈️ Flights** — Curated deal intelligence for 30+ budget routes (Jetstar, AirAsia, VietJet, Scoot, Cebu Pacific and friends): typical sale fares, which airlines fly the route cheapest, and route-specific hacks. One click opens live prices for your exact dates on Google Flights, Skyscanner, and Kiwi.com.
- **🛏️ Stays** — Per-city price intel for hostels, guesthouses, budget hotels and Airbnbs across 25 backpacker hubs, with neighbourhood recommendations, a "clean & comfy" review-filter formula, and pre-filtered searches on Hostelworld, Booking.com, Agoda, and Airbnb.
- **🗺️ Route Planner** — Three field-tested route strategies (Reverse Loop, Classic Southbound, Perth Back Door) with leg-by-leg cost estimates. Set your trip length and travel style and it totals each route and crowns the cheapest — with the reasoning for *why* it saves money.
- **💡 Deal Hacks** — The evergreen playbook: budget-airline sale calendars, carry-on math, land-vs-air rules of thumb, visa costs, seasonal timing, and how to avoid hidden card fees.

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

## How pricing works

Fare and accommodation figures are **planning estimates** based on budget-carrier sale history and typical low-season pricing — they help you judge what a *good* price looks like. Every result links out to live searches pre-filled with your dates, so real-time prices are always one click away. No API keys required.

## Project layout

```
index.html        app shell (tabs: Flights / Stays / Routes / Deal Hacks)
css/styles.css    styling, light + dark mode
js/data.js        route deals, corridor advice, city stay intel, route strategies
js/app.js         search logic, deep-link builders, route cost comparison
```
