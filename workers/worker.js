/* =========================================================================
   Backpacker Buddy — live prices proxy (Cloudflare Worker)

   Proxies travel-data APIs so tokens never reach the browser, and caches
   responses so free quotas go a long way. Supports two providers and
   auto-detects which one is configured:

   • Travelpayouts (recommended — free for individuals)
       flights: Aviasales "prices for dates" (real cached fares + book links)
       hotels:  Hotellook cache API
       secret:  TRAVELPAYOUTS_TOKEN
   • Duffel (optional — true real-time bookable offers)
       flights only. secret: DUFFEL_API_KEY

   Deploy:
     cd workers
     npx wrangler deploy
     npx wrangler secret put TRAVELPAYOUTS_TOKEN   # and/or DUFFEL_API_KEY

   Then paste the worker URL into the "Live prices" panel in the site footer.
   ========================================================================= */

/* Only these sites may call the worker from a browser — keeps strangers'
   websites from spending your API quota. Add your custom domain here when
   you get one. Direct visits/tools (no Origin header) are unaffected. */
const ALLOWED_ORIGINS = [
  "https://vestabehboodi.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
};

const corsFor = (request) => {
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.includes(origin)
    ? { ...CORS, "Access-Control-Allow-Origin": origin }
    : CORS;
};

/* Light per-IP rate limit (per worker instance — a deterrent, not a wall). */
const rateBuckets = new Map();
function rateLimited(request, limit = 30, windowMs = 60_000) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now - b.start > windowMs) {
    rateBuckets.set(ip, { start: now, count: 1 });
    if (rateBuckets.size > 5000) rateBuckets.clear();
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });

/* Edge-cache wrapper: identical queries within `seconds` are free. */
async function cached(request, ctx, seconds, produce) {
  const cacheKey = new Request(new URL(request.url).toString());
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  const body = await produce();
  const res = json(body, 200, { "Cache-Control": `public, s-maxage=${seconds}` });
  ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}

const IATA = /^[A-Za-z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* IATA carrier code → name, for providers that only return codes. */
const AIRLINES = {
  AA: "American", DL: "Delta", UA: "United", AS: "Alaska", WN: "Southwest", B6: "JetBlue",
  QF: "Qantas", JQ: "Jetstar", VA: "Virgin Australia", NZ: "Air New Zealand", FJ: "Fiji Airways",
  TG: "Thai Airways", VJ: "VietJet", VN: "Vietnam Airlines", QH: "Bamboo Airways",
  AK: "AirAsia", D7: "AirAsia X", FD: "Thai AirAsia", QZ: "Indonesia AirAsia", Z2: "Philippines AirAsia",
  TR: "Scoot", SQ: "Singapore Airlines", MH: "Malaysia Airlines", OD: "Batik Air", ID: "Batik Air",
  "5J": "Cebu Pacific", PR: "Philippine Airlines", JT: "Lion Air", GA: "Garuda Indonesia",
  CX: "Cathay Pacific", KE: "Korean Air", OZ: "Asiana", NH: "ANA", JL: "JAL", MM: "Peach",
  ZG: "ZipAir", TW: "T'way", "7C": "Jeju Air", CI: "China Airlines", BR: "EVA Air",
  CA: "Air China", MU: "China Eastern", CZ: "China Southern",
  EK: "Emirates", QR: "Qatar Airways", EY: "Etihad", TK: "Turkish Airlines",
  LH: "Lufthansa", BA: "British Airways", AF: "Air France", KL: "KLM", IB: "Iberia",
  VY: "Vueling", FR: "Ryanair", W6: "Wizz Air", U2: "easyJet", TP: "TAP Portugal",
  N0: "Norse Atlantic", BF: "French Bee", AY: "Finnair", SK: "SAS", LO: "LOT",
  Y4: "Volaris", VB: "VivaAerobus", AM: "Aeroméxico", CM: "Copa", AV: "Avianca",
  P5: "Wingo", JA: "JetSmart", LA: "LATAM", G3: "GOL", AD: "Azul", AR: "Aerolíneas Argentinas",
  H2: "Sky Airline", "6E": "IndiGo", IX: "Air India Express", AI: "Air India",
  SG: "SpiceJet", UL: "SriLankan", U4: "Buddha Air",
};
const carrierName = (code) => AIRLINES[code] || code;

const minsToDuration = (mins) => {
  if (!mins && mins !== 0) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}m`;
};

/* "P1DT2H35M" → "1d 2h 35m" */
const isoToDuration = (s) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(s || "");
  if (!m) return "";
  return [m[1] && `${m[1]}d`, m[2] && `${m[2]}h`, m[3] && `${m[3]}m`].filter(Boolean).join(" ");
};

/* ---------- flights: Duffel (real-time offers) ---------- */
async function duffelFlights(env, { from, to, depart, ret }) {
  const slices = [{ origin: from, destination: to, departure_date: depart }];
  if (ret) slices.push({ origin: to, destination: from, departure_date: ret });
  const res = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DUFFEL_API_KEY}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: { slices, passengers: [{ type: "adult" }], cabin_class: "economy" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream_${res.status}:${detail.slice(0, 300)}`);
  }
  const { data } = await res.json();
  return (data.offers || []).map((o) => {
    const segs = o.slices[0].segments;
    const names = [...new Set(segs.map((s) =>
      (s.marketing_carrier && s.marketing_carrier.name) || o.owner.name))];
    return {
      price: Number(o.total_amount),
      currency: o.total_currency,
      carriers: names,
      stops: segs.length - 1,
      duration: isoToDuration(o.slices[0].duration),
      departAt: segs[0].departing_at,
      arriveAt: segs[segs.length - 1].arriving_at,
      roundTrip: o.slices.length > 1,
    };
  }).sort((a, b) => a.price - b.price).slice(0, 10);
}

/* ---------- flights: Travelpayouts / Aviasales (cached real fares) ---------- */
async function tpQuery(env, { from, to, departAt, returnAt }) {
  const params = new URLSearchParams({
    origin: from,
    destination: to,
    departure_at: departAt,
    one_way: returnAt ? "false" : "true",
    direct: "false",
    sorting: "price",
    currency: "usd",
    limit: "15",
    token: env.TRAVELPAYOUTS_TOKEN,
  });
  if (returnAt) params.set("return_at", returnAt);
  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream_${res.status}:${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  return body.data || [];
}

/* Cheapest recently-seen fare per upcoming month — dense even for dates
   far in the future, where the exact-date cache is empty. */
async function tpGroupedByMonth(env, { from, to }) {
  const params = new URLSearchParams({
    origin: from,
    destination: to,
    group_by: "month",
    currency: "usd",
    token: env.TRAVELPAYOUTS_TOKEN,
  });
  const res = await fetch(`https://api.travelpayouts.com/aviasales/v3/grouped_prices?${params}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream_${res.status}:${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  return Object.values(body.data || {}).filter((f) => f && f.price > 0);
}

async function tpFlights(env, { from, to, depart, ret }) {
  // Level 1: exact dates. Level 2: the whole month (the cache is often
  // sparse for a single long-haul date). Level 3: cheapest fare per
  // upcoming month — sparse-proof, and each result carries its real date.
  let note = null;
  let rows = await tpQuery(env, { from, to, departAt: depart, returnAt: ret });
  if (!rows.length) {
    rows = await tpQuery(env, {
      from,
      to,
      departAt: depart.slice(0, 7),
      returnAt: ret ? ret.slice(0, 7) : "",
    });
    if (rows.length) note = `Nothing cached for ${depart} exactly — showing the cheapest recently-seen fares that month.`;
  }
  if (!rows.length) {
    rows = await tpGroupedByMonth(env, { from, to });
    if (rows.length) note = "Nothing cached near your dates yet (few travellers have searched them) — showing the cheapest recently-seen fare for each upcoming month on this route.";
  }
  const offers = rows.map((f) => ({
    price: Number(f.price),
    currency: "USD",
    carriers: [carrierName(f.airline)],
    stops: f.transfers ?? 0,
    duration: minsToDuration(f.duration),
    departAt: f.departure_at,
    arriveAt: null,
    roundTrip: Boolean(ret),
    link: f.link ? `https://www.aviasales.com${f.link}` : null,
  })).sort((a, b) => a.price - b.price).slice(0, 10);
  return { offers, note };
}

async function flights(request, url, env, ctx) {
  const from = (url.searchParams.get("from") || "").toUpperCase();
  const to = (url.searchParams.get("to") || "").toUpperCase();
  const depart = url.searchParams.get("depart") || "";
  const ret = url.searchParams.get("return") || "";
  if (!IATA.test(from) || !IATA.test(to) || !DATE.test(depart) || (ret && !DATE.test(ret))) {
    return json({ error: "bad_request" }, 400);
  }
  return cached(request, ctx, 2 * 3600, async () => {
    const q = { from, to, depart, ret };
    // Query every configured provider in parallel and merge cheapest-first:
    // Duffel = real-time bookable offers, Aviasales = recently-seen fares
    // (stronger on low-cost carriers). One failing provider doesn't sink the other.
    const tasks = [];
    if (env.DUFFEL_API_KEY) {
      tasks.push(duffelFlights(env, q).then((o) => ({
        offers: o.map((x) => ({ ...x, source: "duffel" })),
        note: null,
      })));
    }
    if (env.TRAVELPAYOUTS_TOKEN) {
      tasks.push(tpFlights(env, q).then(({ offers, note }) => ({
        offers: offers.map((x) => ({ ...x, source: "aviasales" })),
        note,
      })));
    }
    if (!tasks.length) throw new Error("not_configured");
    const results = await Promise.allSettled(tasks);
    const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const offers = fulfilled
      .flatMap((v) => v.offers)
      .sort((a, b) => a.price - b.price)
      .slice(0, 12);
    if (!offers.length && !fulfilled.length) throw results[0].reason;
    const note = fulfilled.map((v) => v.note).filter(Boolean).join(" ") || null;
    return { offers, note, fetchedAt: new Date().toISOString() };
  });
}

/* ---------- hotels: Travelpayouts / Hotellook ---------- */
async function hotels(request, url, env, ctx) {
  const name = url.searchParams.get("name") || "";
  const checkin = url.searchParams.get("checkin") || "";
  const checkout = url.searchParams.get("checkout") || "";
  if (!name || name.length > 80 || !DATE.test(checkin) || !DATE.test(checkout)) {
    return json({ error: "bad_request" }, 400);
  }
  return cached(request, ctx, 6 * 3600, async () => {
    if (!env.TRAVELPAYOUTS_TOKEN) throw new Error("not_configured");
    const params = new URLSearchParams({
      location: name,
      checkIn: checkin,
      checkOut: checkout,
      currency: "usd",
      limit: "20",
      token: env.TRAVELPAYOUTS_TOKEN,
    });
    const res = await fetch(`https://engine.hotellook.com/api/v2/cache.json?${params}`);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`upstream_${res.status}:${detail.slice(0, 300)}`);
    }
    const body = await res.json();
    const nights = Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / 86_400_000));
    const hotels = (Array.isArray(body) ? body : [])
      .filter((h) => h.priceFrom > 0)
      .map((h) => ({
        name: h.hotelName,
        total: Number(h.priceFrom),
        perNight: Number(h.priceFrom) / nights,
        currency: "USD",
        stars: h.stars || null,
      }))
      .sort((a, b) => a.perNight - b.perNight)
      .slice(0, 12);
    return { hotels, nights, fetchedAt: new Date().toISOString() };
  });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsFor(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (rateLimited(request)) {
      return new Response(JSON.stringify({ error: "rate_limited", hint: "Slow down a little — try again in a minute." }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    const url = new URL(request.url);
    // Re-stamp CORS per request so cached responses work from any allowed origin.
    const finalize = (res) => {
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    };
    try {
      if (url.pathname === "/api/health") {
        const flightsProvider = env.DUFFEL_API_KEY ? "duffel" : env.TRAVELPAYOUTS_TOKEN ? "travelpayouts" : null;
        const hotelsProvider = env.TRAVELPAYOUTS_TOKEN ? "travelpayouts" : null;
        return finalize(json({
          ok: true,
          configured: Boolean(flightsProvider || hotelsProvider),
          providers: { flights: flightsProvider, hotels: hotelsProvider },
        }));
      }
      if (url.pathname === "/api/flights") return finalize(await flights(request, url, env, ctx));
      if (url.pathname === "/api/hotels") return finalize(await hotels(request, url, env, ctx));
      return finalize(json({ error: "not_found" }, 404));
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === "not_configured") {
        return finalize(json({
          error: "not_configured",
          hint: "Set a provider token with `wrangler secret put TRAVELPAYOUTS_TOKEN` (or DUFFEL_API_KEY for flights).",
        }, 503));
      }
      return finalize(json({ error: "upstream", detail: msg.slice(0, 400) }, 502));
    }
  },
};
