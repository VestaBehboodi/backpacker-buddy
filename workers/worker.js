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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
      duration: (o.slices[0].duration || "").replace("PT", "").toLowerCase(),
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

async function tpFlights(env, { from, to, depart, ret }) {
  // Exact dates first; the cache is often sparse for a single long-haul
  // date, so fall back to the whole month's cheapest fares (each result
  // carries its own real date, which the UI displays).
  let rows = await tpQuery(env, { from, to, departAt: depart, returnAt: ret });
  if (!rows.length) {
    rows = await tpQuery(env, {
      from,
      to,
      departAt: depart.slice(0, 7),
      returnAt: ret ? ret.slice(0, 7) : "",
    });
  }
  return rows.map((f) => ({
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
      tasks.push(duffelFlights(env, q).then((o) => o.map((x) => ({ ...x, source: "duffel" }))));
    }
    if (env.TRAVELPAYOUTS_TOKEN) {
      tasks.push(tpFlights(env, q).then((o) => o.map((x) => ({ ...x, source: "aviasales" }))));
    }
    if (!tasks.length) throw new Error("not_configured");
    const results = await Promise.allSettled(tasks);
    const offers = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => a.price - b.price)
      .slice(0, 12);
    if (!offers.length && results.every((r) => r.status === "rejected")) throw results[0].reason;
    return { offers, fetchedAt: new Date().toISOString() };
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
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const flightsProvider = env.DUFFEL_API_KEY ? "duffel" : env.TRAVELPAYOUTS_TOKEN ? "travelpayouts" : null;
        const hotelsProvider = env.TRAVELPAYOUTS_TOKEN ? "travelpayouts" : null;
        return json({
          ok: true,
          configured: Boolean(flightsProvider || hotelsProvider),
          providers: { flights: flightsProvider, hotels: hotelsProvider },
        });
      }
      if (url.pathname === "/api/flights") return await flights(request, url, env, ctx);
      if (url.pathname === "/api/hotels") return await hotels(request, url, env, ctx);
      return json({ error: "not_found" }, 404);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === "not_configured") {
        return json({
          error: "not_configured",
          hint: "Set a provider token with `wrangler secret put TRAVELPAYOUTS_TOKEN` (or DUFFEL_API_KEY for flights).",
        }, 503);
      }
      return json({ error: "upstream", detail: msg.slice(0, 400) }, 502);
    }
  },
};
