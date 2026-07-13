/* =========================================================================
   Backpacker Buddy — live prices proxy (Cloudflare Worker)

   Proxies the Amadeus Self-Service API so the API key never reaches the
   browser, and caches responses so a free-tier quota goes a long way.

   Deploy:
     cd workers
     npx wrangler deploy
     npx wrangler secret put AMADEUS_API_KEY      # paste when prompted
     npx wrangler secret put AMADEUS_API_SECRET   # paste when prompted
     # optional: npx wrangler secret put AMADEUS_ENV   ("production"; default "test")

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

const apiBase = (env) =>
  (env.AMADEUS_ENV || "test") === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

/* OAuth token, cached in the worker instance between requests. */
let tokenCache = { token: null, exp: 0 };
async function getToken(env) {
  if (!env.AMADEUS_API_KEY || !env.AMADEUS_API_SECRET) {
    throw new Error("not_configured");
  }
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const res = await fetch(apiBase(env) + "/v1/security/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.AMADEUS_API_KEY,
      client_secret: env.AMADEUS_API_SECRET,
    }),
  });
  if (!res.ok) throw new Error("auth_failed");
  const d = await res.json();
  tokenCache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return d.access_token;
}

async function amadeus(env, path, params) {
  const token = await getToken(env);
  const url = apiBase(env) + path + "?" + new URLSearchParams(params);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upstream_${res.status}:${detail.slice(0, 300)}`);
  }
  return res.json();
}

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

async function flights(request, url, env, ctx) {
  const from = (url.searchParams.get("from") || "").toUpperCase();
  const to = (url.searchParams.get("to") || "").toUpperCase();
  const depart = url.searchParams.get("depart") || "";
  const ret = url.searchParams.get("return") || "";
  if (!IATA.test(from) || !IATA.test(to) || !DATE.test(depart) || (ret && !DATE.test(ret))) {
    return json({ error: "bad_request" }, 400);
  }
  return cached(request, ctx, 2 * 3600, async () => {
    const params = {
      originLocationCode: from,
      destinationLocationCode: to,
      departureDate: depart,
      adults: "1",
      currencyCode: "USD",
      max: "20",
    };
    if (ret) params.returnDate = ret;
    const data = await amadeus(env, "/v2/shopping/flight-offers", params);
    const carriers = (data.dictionaries && data.dictionaries.carriers) || {};
    const offers = (data.data || []).map((o) => {
      const firstItin = o.itineraries[0];
      const segs = firstItin.segments;
      const names = [...new Set(segs.map((s) => carriers[s.carrierCode] || s.carrierCode))];
      return {
        price: Number(o.price.grandTotal),
        currency: o.price.currency,
        carriers: names,
        stops: segs.length - 1,
        duration: firstItin.duration.replace("PT", "").toLowerCase(),
        departAt: segs[0].departure.at,
        arriveAt: segs[segs.length - 1].arrival.at,
        roundTrip: o.itineraries.length > 1,
      };
    }).sort((a, b) => a.price - b.price).slice(0, 10);
    return { offers, fetchedAt: new Date().toISOString() };
  });
}

async function hotels(request, url, env, ctx) {
  const city = (url.searchParams.get("city") || "").toUpperCase();
  const checkin = url.searchParams.get("checkin") || "";
  const checkout = url.searchParams.get("checkout") || "";
  if (!IATA.test(city) || !DATE.test(checkin) || !DATE.test(checkout)) {
    return json({ error: "bad_request" }, 400);
  }
  return cached(request, ctx, 6 * 3600, async () => {
    const list = await amadeus(env, "/v1/reference-data/locations/hotels/by-city", {
      cityCode: city,
      radius: "15",
      radiusUnit: "KM",
      hotelSource: "ALL",
    });
    const ids = (list.data || []).slice(0, 40).map((h) => h.hotelId);
    if (!ids.length) return { hotels: [], fetchedAt: new Date().toISOString() };
    const offers = await amadeus(env, "/v3/shopping/hotel-offers", {
      hotelIds: ids.join(","),
      adults: "1",
      checkInDate: checkin,
      checkOutDate: checkout,
      currency: "USD",
      bestRateOnly: "true",
    });
    const nights = Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / 86_400_000));
    const hotels = (offers.data || [])
      .filter((h) => h.available !== false && h.offers && h.offers.length)
      .map((h) => ({
        name: h.hotel.name,
        total: Number(h.offers[0].price.total),
        perNight: Number(h.offers[0].price.total) / nights,
        currency: h.offers[0].price.currency,
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
        return json({ ok: true, configured: Boolean(env.AMADEUS_API_KEY && env.AMADEUS_API_SECRET) });
      }
      if (url.pathname === "/api/flights") return await flights(request, url, env, ctx);
      if (url.pathname === "/api/hotels") return await hotels(request, url, env, ctx);
      return json({ error: "not_found" }, 404);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg === "not_configured") {
        return json({ error: "not_configured", hint: "Set AMADEUS_API_KEY and AMADEUS_API_SECRET with `wrangler secret put`." }, 503);
      }
      if (msg === "auth_failed") {
        return json({ error: "auth_failed", hint: "Amadeus rejected the key/secret — re-check them in the Amadeus dashboard." }, 502);
      }
      return json({ error: "upstream", detail: msg.slice(0, 400) }, 502);
    }
  },
};
