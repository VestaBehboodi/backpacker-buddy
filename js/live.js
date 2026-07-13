/* Backpacker Buddy — optional live prices via the bundled Amadeus proxy worker.
   Disabled until a worker URL is saved in the footer panel; everything
   degrades gracefully back to the deep links when it's off or erroring. */
"use strict";

const LIVE = {
  base() {
    try { return (localStorage.getItem("bb-live-api") || "").trim().replace(/\/+$/, ""); }
    catch { return ""; }
  },
  set(url) {
    try {
      if (url) localStorage.setItem("bb-live-api", url.trim());
      else localStorage.removeItem("bb-live-api");
    } catch { /* private mode — live prices just stay off */ }
  },
  enabled() { return Boolean(this.base()); },
};

async function liveFetch(path, params, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${LIVE.base()}${path}?${new URLSearchParams(params)}`, { signal: ctrl.signal });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.hint || body.error || `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const liveErrorNote = (what) =>
  `<p class="live-note">⚡ Couldn't load live ${what} right now — the search links above always work.</p>`;

const fmtTime = (iso) => iso ? iso.slice(11, 16) : "";
const fmtDay = (iso) => iso ? iso.slice(5, 10).replace("-", "/") : "";

/* Guard against out-of-order responses when the user searches quickly. */
let flightSeq = 0;
async function renderLiveFlights(container, { from, to, depart, ret }) {
  const seq = ++flightSeq;
  container.innerHTML = `<p class="live-note live-loading">⚡ Checking live fares…</p>`;
  try {
    const params = { from, to, depart };
    if (ret) params["return"] = ret;
    const { offers } = await liveFetch("/api/flights", params);
    if (seq !== flightSeq) return;
    if (!offers.length) {
      container.innerHTML = `<p class="live-note">⚡ No live fares came back for these dates — try the search links above.</p>`;
      return;
    }
    container.innerHTML = `
      <h4 class="live-title">⚡ Live fares right now ${offers[0].roundTrip ? "(round-trip)" : "(one-way)"}</h4>
      <ul class="offer-list">
        ${offers.slice(0, 6).map((o) => {
          const when = `${fmtDay(o.departAt)} ${fmtTime(o.departAt)}${o.arriveAt ? " → " + fmtTime(o.arriveAt) : ""}`.trim();
          const stops = o.stops === 0 ? "nonstop" : o.stops + " stop" + (o.stops > 1 ? "s" : "");
          const sub = [when, stops, o.duration].filter(Boolean).join(" · ");
          return `
          <li class="offer-row">
            <span class="offer-price">${fmt(o.price)}</span>
            <span class="offer-main">
              <strong>${o.carriers.join(" + ")}</strong>
              <span class="offer-sub">${sub}</span>
            </span>
            ${o.link ? `<a class="btn btn-go offer-book" href="${o.link}" target="_blank" rel="noopener">Book ↗</a>` : ""}
          </li>`;
        }).join("")}
      </ul>
      <p class="fine-print">Live prices via your connected worker. Prefer booking on the airline's own site (see “Stay flexible” in Deal Hacks).</p>`;
  } catch (e) {
    if (seq !== flightSeq) return;
    container.innerHTML = liveErrorNote("fares");
  }
}

let hotelSeq = 0;
async function renderLiveHotels(container, { name, checkin, checkout }) {
  const seq = ++hotelSeq;
  container.innerHTML = `<p class="live-note live-loading">⚡ Checking live room rates…</p>`;
  try {
    const { hotels } = await liveFetch("/api/hotels", { name, checkin, checkout });
    if (seq !== hotelSeq) return;
    if (!hotels.length) {
      container.innerHTML = `<p class="live-note">⚡ No live rates came back for this city — hostels rarely appear here anyway; use the search links above.</p>`;
      return;
    }
    container.innerHTML = `
      <h4 class="live-title">⚡ Live hotel rates right now</h4>
      <ul class="offer-list">
        ${hotels.slice(0, 8).map((h) => `
          <li class="offer-row">
            <span class="offer-price">${fmt(h.perNight)}<span class="price-sub">/night</span></span>
            <span class="offer-main"><strong>${h.name}</strong><span class="offer-sub">${fmt(h.total)} total for your dates${h.stars ? " · " + "★".repeat(h.stars) : ""}</span></span>
          </li>`).join("")}
      </ul>
      <p class="fine-print">Rates via your connected worker (hotels only — hostels still live on Hostelworld). Cross-check the Booking/Agoda links for the same property.</p>`;
  } catch (e) {
    if (seq !== hotelSeq) return;
    container.innerHTML = liveErrorNote("room rates");
  }
}

/* Footer setup panel. */
function initLiveSetup() {
  const input = $("#live-api-input");
  const status = $("#live-api-status");
  input.value = LIVE.base();
  const refresh = () => {
    $("#live-indicator").textContent = LIVE.enabled() ? "on" : "off";
  };
  refresh();
  $("#live-api-save").addEventListener("click", async () => {
    const url = input.value.trim().replace(/\/+$/, "");
    if (!url) {
      LIVE.set("");
      status.textContent = "Live prices turned off.";
      refresh();
      renderFlightResult();
      renderStayResult();
      return;
    }
    status.textContent = "Checking…";
    try {
      const res = await fetch(url + "/api/health");
      const body = await res.json();
      if (!body.ok) throw new Error("bad response");
      LIVE.set(url);
      status.textContent = body.configured
        ? "✅ Connected — live prices are on."
        : "⚠️ Worker reached, but no provider token is set yet (wrangler secret put TRAVELPAYOUTS_TOKEN, or DUFFEL_API_KEY).";
      refresh();
      renderFlightResult();
      renderStayResult();
    } catch {
      status.textContent = "❌ Couldn't reach a Backpacker Buddy worker at that URL — check the address (it should end in .workers.dev or your own domain).";
    }
  });
}
