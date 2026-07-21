/* Backpacker Buddy — app logic */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtRange = ([a, b]) => `${fmt(a)}–${fmt(b)}`;

/* Resolve free-typed text or a datalist pick ("Lisbon, Portugal (LIS)")
   to { code, name, region }. code/region may be null for unknown places. */
function resolveCity(text) {
  const raw = (text || "").trim();
  if (!raw) return null;

  const codeMatch = raw.match(/\(([A-Za-z]{3})\)\s*$/);
  const bareCode = /^[A-Za-z]{3}$/.test(raw) ? raw.toUpperCase() : null;
  const code = codeMatch ? codeMatch[1].toUpperCase() : bareCode;

  for (const region of REGIONS) {
    for (const c of region.cities) {
      if (code && c.code === code) return { ...c, region: region.id, regionName: region.name };
    }
  }
  const lower = raw.toLowerCase();
  for (const region of REGIONS) {
    for (const c of region.cities) {
      if (c.name.toLowerCase().includes(lower)) return { ...c, region: region.id, regionName: region.name };
    }
  }
  // Unknown place — keep what the user typed.
  return { code, name: raw.replace(/\s*\([A-Za-z]{3}\)\s*$/, ""), region: null, regionName: null };
}

function corridorKey(a, b) {
  const order = ["california", "australia", "sea"];
  const [x, y] = [a, b].sort((p, q) => order.indexOf(p) - order.indexOf(q));
  return `${x}-${y}`;
}

function findDeal(a, b) {
  if (!a || !b) return null;
  return FLIGHT_DEALS.find(
    (d) => (d.pair[0] === a && d.pair[1] === b) || (d.pair[0] === b && d.pair[1] === a)
  );
}

/* ---------- tabs ---------- */
function initTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => b.classList.remove("active"));
      $$(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("#" + btn.dataset.panel).classList.add("active");
    });
  });
}

/* ---------- flights ---------- */
function populateCityDatalist() {
  const dl = $("#city-list");
  REGIONS.forEach((region) => {
    region.cities.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = `${c.name} (${c.code})`;
      dl.appendChild(opt);
    });
  });
  $("#fly-from").value = "Los Angeles (LAX)";
  $("#fly-to").value = "Sydney (SYD)";
}

function flightLinks(from, to, depart, ret) {
  const gq = `Flights from ${from.name} to ${to.name}` +
    (depart ? ` on ${depart}` : "") + (ret ? ` returning ${ret}` : "");
  const links = [
    { name: "Google Flights", url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gq + (ret ? "" : " one way"))}` },
  ];
  if (from.code && to.code) {
    const sky = (d) => (d ? d.replaceAll("-", "").slice(2) : "");
    links.push(
      { name: "Skyscanner", url: `https://www.skyscanner.com/transport/flights/${from.code.toLowerCase()}/${to.code.toLowerCase()}/${sky(depart)}/${ret ? sky(ret) + "/" : ""}` },
      { name: "Kiwi.com", url: `https://www.kiwi.com/en/search/results/${from.code.toLowerCase()}/${to.code.toLowerCase()}/${depart || "anytime"}/${ret || "no-return"}` },
    );
  }
  return links;
}

function renderFlightResult() {
  const from = resolveCity($("#fly-from").value);
  const to = resolveCity($("#fly-to").value);
  const depart = $("#fly-depart").value;
  const ret = $("#fly-return").value;
  const out = $("#flight-result");

  if (!from || !to) {
    out.innerHTML = `<div class="card notice">Tell me where you're starting and where you're dreaming of — any city works.</div>`;
    return;
  }
  if (from.name === to.name) {
    out.innerHTML = `<div class="card notice">Pick two different places and I'll get to work. 😉</div>`;
    return;
  }

  const deal = findDeal(from.code, to.code);
  const corridor = from.region && to.region ? CORRIDORS[corridorKey(from.region, to.region)] : null;
  const links = flightLinks(from, to, depart, ret);

  let intel = "";
  if (deal) {
    intel = `
      <div class="price-row">
        <div class="price-block">
          <span class="price-label">Great sale fare</span>
          <span class="price-big">${fmt(deal.low)}</span>
          <span class="price-sub">one-way</span>
        </div>
        <div class="price-block">
          <span class="price-label">Typical low fare</span>
          <span class="price-big">${fmtRange(deal.typ)}</span>
          <span class="price-sub">one-way</span>
        </div>
      </div>
      <p><strong>Budget airlines on this route:</strong> ${deal.airlines}</p>
      <p class="agent-tip">💡 ${deal.note}</p>`;
  } else if (corridor) {
    intel = `
      <div class="price-row">
        <div class="price-block">
          <span class="price-label">Typical fares — ${corridor.label}</span>
          <span class="price-big">${fmtRange(corridor.typ)}</span>
          <span class="price-sub">one-way</span>
        </div>
      </div>
      <p class="agent-tip">💡 ${corridor.advice}</p>`;
  } else {
    // World route: share what we know about each end.
    const tips = [...new Set([from.region, to.region].filter(Boolean))]
      .map((r) => REGION_TIPS[r]).filter(Boolean);
    if (!tips.length) tips.push(REGION_TIPS.restofworld);
    intel = tips.map((t) => `<p class="agent-tip">💡 ${t}</p>`).join("");
    if (!from.code || !to.code) {
      intel += `<p class="corridor-note">🧭 I don't recognise ${!from.code ? `“${from.name}”` : `“${to.name}”`} — the Google Flights link below still works with any place name. Pick a city from the suggestions to unlock Skyscanner and Kiwi links too.</p>`;
    }
  }

  const corridorExtra = deal && corridor ? `<p class="corridor-note">🧭 <strong>${corridor.label}:</strong> ${corridor.advice}</p>` : "";

  const liveReady = LIVE.enabled() && from.code && to.code && depart;
  out.innerHTML = `
    <div class="card result-card">
      <h3>${from.name} → ${to.name}</h3>
      ${intel}
      ${corridorExtra}
      ${liveReady ? `<div id="live-flights" class="live-block"></div>` : ""}
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Live prices on ${l.name} ↗</a>`).join("")}
      </div>
      <p class="fine-print">Estimates are typical one-way USD fares from budget-carrier sale history. The buttons above open today's live prices for your dates.</p>
    </div>`;
  if (liveReady) renderLiveFlights($("#live-flights"), { from: from.code, to: to.code, depart, ret });
}

/* ---------- stays ---------- */
function populateStayDatalist() {
  const dl = $("#stay-city-list");
  Object.keys(STAYS).forEach((city) => {
    const opt = document.createElement("option");
    opt.value = `${city}, ${STAYS[city].country}`;
    dl.appendChild(opt);
  });
  $("#stay-city").value = "Bangkok, Thailand";
}

/* Match typed text to a STAYS key ("Bangkok, Thailand" or "bangkok"). */
function resolveStayCity(text) {
  const raw = (text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const key of Object.keys(STAYS)) {
    const full = `${key}, ${STAYS[key].country}`.toLowerCase();
    if (lower === full || lower === key.toLowerCase() || full.startsWith(lower)) {
      return { key, label: `${key}, ${STAYS[key].country}` };
    }
  }
  return { key: null, label: raw };
}

function stayLinks(label, checkin, checkout, maxPrice, flexOnly) {
  const q = encodeURIComponent(label);
  const bookingFilters = ["review_score=80"];
  if (flexOnly) bookingFilters.push("fc=2");
  return [
    { name: "Hostelworld", url: `https://www.hostelworld.com/search?search_keywords=${q}${checkin ? `&date_from=${checkin}&date_to=${checkout || checkin}` : ""}&number_of_guests=1` },
    { name: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${q}${checkin ? `&checkin=${checkin}&checkout=${checkout || checkin}` : ""}&group_adults=1&no_rooms=1&nflt=${encodeURIComponent(bookingFilters.join(";"))}` },
    { name: "Agoda", url: `https://www.agoda.com/search?textToSearch=${q}${checkin ? `&checkIn=${checkin}` : ""}&adults=1&rooms=1&sort=priceLowToHigh` },
    { name: "Airbnb", url: `https://www.airbnb.com/s/${q}/homes?adults=1${checkin ? `&checkin=${checkin}&checkout=${checkout || checkin}` : ""}${maxPrice ? `&price_max=${maxPrice}` : ""}` },
  ];
}

function renderStayResult() {
  const resolved = resolveStayCity($("#stay-city").value);
  const checkin = $("#stay-in").value;
  const checkout = $("#stay-out").value;
  const budget = parseInt($("#stay-budget").value, 10);
  const flexOnly = $("#stay-flex").checked;
  const out = $("#stay-result");

  if (!resolved) {
    out.innerHTML = `<div class="card notice">Type any city in the world and I'll build the searches for you.</div>`;
    return;
  }

  const links = stayLinks(resolved.label, checkin, checkout, budget, flexOnly);
  const liveName = resolved.label.split(" (")[0].split(",")[0].trim();
  const liveReady = LIVE.enabled() && liveName && checkin && checkout;
  const liveBlock = liveReady ? `<div id="live-hotels" class="live-block"></div>` : "";
  const flexNote = flexOnly
    ? `<p class="agent-tip">↩️ <strong>Free cancellation only:</strong> the Booking.com link is filtered to free-cancellation rates. On Hostelworld pick the “Free cancellation” rate at checkout; on Airbnb look for “Flexible” policy listings.</p>`
    : "";

  if (!resolved.key) {
    out.innerHTML = `
      <div class="card result-card">
        <h3>${resolved.label}</h3>
        <p>I don't have curated intel for this one (yet!) — but the searches below work for any city on Earth, and the golden rule travels with you:</p>
        <p class="agent-tip">🧼 <strong>Clean &amp; comfy filter:</strong> rating ≥ 8.3 with 150+ reviews, then skim the recent negative reviews. The Booking link is pre-filtered to 8.0+, Agoda is sorted cheapest-first.</p>
        ${flexNote}
        ${liveBlock}
        <div class="link-row">
          ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Search ${l.name} ↗</a>`).join("")}
        </div>
      </div>`;
    if (liveReady) renderLiveHotels($("#live-hotels"), { name: liveName, checkin, checkout });
    return;
  }

  const s = STAYS[resolved.key];
  const fits = (range) => budget >= range[0];
  const rows = [
    { label: "🛏️ Hostel dorm bed", range: s.dorm },
    { label: "🚪 Private room (hostel/guesthouse)", range: s.private },
    { label: "🏨 Budget hotel / Airbnb room", range: s.hotel },
  ];

  out.innerHTML = `
    <div class="card result-card">
      <h3>${resolved.label}</h3>
      <table class="price-table">
        ${rows.map((r) => `
          <tr class="${fits(r.range) ? "" : "over-budget"}">
            <td>${r.label}</td>
            <td class="num">${fmtRange(r.range)}<span class="price-sub">/night</span></td>
            <td>${fits(r.range) ? "✅ in budget" : "⚠️ over your " + fmt(budget) + "/night"}</td>
          </tr>`).join("")}
      </table>
      <p><strong>Where to stay:</strong> ${s.areas}</p>
      <p class="agent-tip">💡 ${s.tip}</p>
      <p class="agent-tip">🧼 <strong>Clean &amp; comfy filter:</strong> rating ≥ 8.3 with 150+ reviews, then skim the recent negative reviews. The Booking link below is pre-filtered to 8.0+, Agoda is sorted cheapest-first.</p>
      ${flexNote}
      ${liveBlock}
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Search ${l.name} ↗</a>`).join("")}
      </div>
    </div>`;
  if (liveReady) renderLiveHotels($("#live-hotels"), { name: liveName, checkin, checkout });
}

/* ---------- routes ---------- */
function renderRoutes() {
  const months = parseInt($("#route-months").value, 10);
  const style = $("#route-style").value;
  const regionFilter = $("#route-region").value;
  const budget = parseFloat($("#route-budget").value) || 0;
  $("#route-months-label").textContent = months + (months === 1 ? " month" : " months");
  const days = months * 30;
  const out = $("#route-results");

  const pool = ROUTE_STRATEGIES.filter((r) => regionFilter === "all" || r.region === regionFilter);

  const cards = pool.map((r) => {
    const flightTotal = r.legs.reduce((sum, l) => sum + l.est, 0);
    const groundTotal = days * r.daily[style];
    const total = flightTotal + groundTotal;
    // How long would the user's budget last on this route?
    const affordableMonths = budget > flightTotal ? (budget - flightTotal) / (r.daily[style] * 30) : 0;
    return { r, flightTotal, groundTotal, total, affordableMonths };
  }).sort((a, b) => a.total - b.total);

  if (!cards.length) { out.innerHTML = ""; return; }
  const cheapest = cards[0].total;

  const budgetBadge = ({ total, flightTotal, affordableMonths }) => {
    if (!budget) return "";
    if (total <= budget) {
      return `<div class="fit-badge fit-yes">✅ Fits your ${fmt(budget)} budget — ${fmt(budget - total)} to spare</div>`;
    }
    if (affordableMonths >= 0.5) {
      return `<div class="fit-badge fit-partial">⚠️ ${fmt(total - budget)} over budget at ${months} months — but ${fmt(budget)} funds ~${affordableMonths.toFixed(1)} months on this route</div>`;
    }
    return `<div class="fit-badge fit-no">❌ ${fmt(budget)} doesn't cover the transport (${fmt(flightTotal)}) — consider a shorter or closer route</div>`;
  };

  out.innerHTML = cards.map((c, i) => {
    const { r, flightTotal, groundTotal, total } = c;
    return `
    <div class="card route-card ${i === 0 ? "best" : ""}">
      ${i === 0 ? `<div class="best-badge">🏆 Cheapest for your trip</div>` : `<div class="delta-badge">+${fmt(total - cheapest)} vs cheapest</div>`}
      <span class="region-chip">${r.regionLabel}</span>
      <h3>${r.emoji} ${r.name}</h3>
      <p class="tagline">${r.tagline}</p>
      <ol class="legs">
        ${r.legs.map((l) => `
          <li>
            <span class="leg-mode">${l.mode === "flight" ? "✈️" : "🚌"}</span>
            <span class="leg-desc"><strong>${l.from}${l.to ? " → " + l.to : ""}</strong> · ~${fmt(l.est)}<br><span class="leg-note">${l.note}</span></span>
          </li>`).join("")}
      </ol>
      <div class="route-totals">
        <div><span class="price-label">Transport total</span><span class="price-big">${fmt(flightTotal)}</span></div>
        <div><span class="price-label">${months} mo on the ground (${style})</span><span class="price-big">${fmt(groundTotal)}</span></div>
        <div class="grand"><span class="price-label">Estimated trip total</span><span class="price-big">${fmt(total)}</span></div>
      </div>
      ${budgetBadge(c)}
      <p class="agent-tip">💰 <strong>Why it saves money:</strong> ${r.why}</p>
    </div>`;
  }).join("");
}

/* ---------- custom route builder ---------- */
const selectedCountries = [];

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Fare model: base + per-km, scaled by how cheap the regional market is. */
function marketFactor(mA, mB, km) {
  if (km > 7000) return 0.95; // long-haul: competition on trunk routes
  if (mA === mB) {
    const same = { sea: 0.75, europe: 0.6, southasia: 0.8, eastasia: 0.85, latam: 1.2, oceania: 1.1, mea: 1.3, na: 1.0 };
    return same[mA] || 1;
  }
  if (mA === "mea" || mB === "mea") return 1.25;
  if (mA === "latam" || mB === "latam") return 1.2;
  return 1;
}

function legBetween(a, b) {
  const km = haversineKm(a, b);
  const overland = a.zone && b.zone && a.zone === b.zone && km < 1600;
  const cost = overland
    ? Math.max(12, km * 0.028)
    : (28 + km * 0.034) * marketFactor(a.market, b.market, km);
  return { from: a, to: b, km: Math.round(km), mode: overland ? "ground" : "flight", est: Math.round(cost / 5) * 5 };
}

/* Order countries to minimise backtracking: nearest-neighbour from the
   origin, then a 2-opt pass to untangle any crossings the greedy pass left. */
function orderCountries(origin, names) {
  const remaining = names.slice();
  const ordered = [];
  let cur = origin;
  while (remaining.length) {
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((n, i) => {
      const d = haversineKm(cur, COUNTRIES[n]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
    cur = COUNTRIES[ordered[ordered.length - 1]];
  }

  // 2-opt: origin is pinned at both ends (the trip loops home).
  const pt = (i) => (i < 0 || i >= ordered.length) ? origin : COUNTRIES[ordered[i]];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const before = haversineKm(pt(i - 1), pt(i)) + haversineKm(pt(j), pt(j + 1));
        const after = haversineKm(pt(i - 1), pt(j)) + haversineKm(pt(i), pt(j + 1));
        if (after + 1 < before) {
          const seg = ordered.slice(i, j + 1).reverse();
          ordered.splice(i, seg.length, ...seg);
          improved = true;
        }
      }
    }
  }
  return ordered;
}

function populateBuilderInputs() {
  const dl = $("#country-list");
  Object.keys(COUNTRIES).sort().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  });
  const sel = $("#builder-origin");
  ORIGINS.forEach((o, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = o.name;
    sel.appendChild(opt);
  });
}

function addCountry() {
  const input = $("#builder-country");
  const raw = input.value.trim();
  const err = $("#builder-error");
  err.textContent = "";
  if (!raw) return;
  const match = Object.keys(COUNTRIES).find((n) => n.toLowerCase() === raw.toLowerCase()) ||
    Object.keys(COUNTRIES).find((n) => n.toLowerCase().startsWith(raw.toLowerCase()));
  if (!match) {
    err.textContent = `I don't have "${raw}" in my atlas yet — pick from the suggestions for now.`;
    return;
  }
  if (!selectedCountries.includes(match)) selectedCountries.push(match);
  input.value = "";
  renderChips();
  renderCustomRoute();
}

function renderChips() {
  $("#builder-chips").innerHTML = selectedCountries.map((n) =>
    `<button type="button" class="chip" data-country="${n}" title="Remove ${n}">${n} ✕</button>`
  ).join("");
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* [11,12,1,2,3] -> "Nov–Mar"; handles wraparound and split ranges. */
function formatMonths(arr) {
  const set = new Set(arr);
  if (set.size >= 12) return "year-round";
  if (!set.size) return "";
  let start = 0;
  while (set.has((start % 12) + 1)) start++; // first absent month, so runs don't wrap
  const runs = [];
  let cur = null;
  for (let k = 1; k <= 12; k++) {
    const m = ((start + k - 1) % 12) + 1;
    if (set.has(m)) { if (!cur) cur = [m, m]; else cur[1] = m; }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map(([a, b]) => (a === b ? MON[a - 1] : `${MON[a - 1]}–${MON[b - 1]}`)).join(", ");
}

/* Airport code for a route point (origin has .code; a country has it in gateway). */
function pointCode(p) {
  if (p.code) return p.code;
  const m = p.gateway && p.gateway.match(/\(([A-Z]{3})\)/);
  return m ? m[1] : null;
}

function labelForCode(code) {
  const hit = resolveCity(code);
  return hit && hit.code ? `${hit.name} (${hit.code})` : code;
}

/* In-app jumps from a route into the live Flights / Stays tabs. */
function goToFlights(fromCode, toCode) {
  $("#fly-from").value = labelForCode(fromCode);
  $("#fly-to").value = labelForCode(toCode);
  document.querySelector('[data-panel="panel-flights"]').click();
  renderFlightResult();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function goToStays(city) {
  $("#stay-city").value = city;
  document.querySelector('[data-panel="panel-stays"]').click();
  renderStayResult();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---- shareable & saved trips ---- */
function currentTrip() {
  return {
    countries: selectedCountries.slice(),
    origin: $("#builder-origin").value,
    months: $("#route-months").value,
    style: $("#route-style").value,
    budget: $("#route-budget").value,
    start: $("#route-start-month").value,
  };
}
function shareURL() {
  const t = currentTrip();
  const p = new URLSearchParams();
  p.set("countries", t.countries.join(","));
  p.set("origin", t.origin);
  p.set("months", t.months);
  p.set("style", t.style);
  if (t.budget) p.set("budget", t.budget);
  p.set("start", t.start);
  return location.origin + location.pathname + "?" + p.toString();
}
function saveTrip() {
  try { localStorage.setItem("bb-trip", JSON.stringify(currentTrip())); } catch { /* private mode */ }
}
function applyTrip(t) {
  if (!t) return false;
  const valid = (t.countries || []).filter((c) => COUNTRIES[c]);
  selectedCountries.length = 0;
  valid.forEach((c) => selectedCountries.push(c));
  const setIf = (sel, v) => { if (v != null && v !== "") $(sel).value = v; };
  if (t.origin != null && $(`#builder-origin option[value="${t.origin}"]`)) $("#builder-origin").value = t.origin;
  setIf("#route-months", t.months);
  setIf("#route-style", t.style);
  setIf("#route-budget", t.budget);
  setIf("#route-start-month", t.start);
  renderChips();
  return valid.length > 0;
}
async function copyShare(btn) {
  const url = shareURL();
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "✅ Link copied!";
  } catch {
    window.prompt("Copy your trip link:", url);
    btn.textContent = "🔗 Copy share link";
  }
  setTimeout(() => { btn.textContent = "🔗 Copy share link"; }, 2500);
}

function renderCustomRoute() {
  saveTrip();
  const out = $("#custom-route-result");
  if (!selectedCountries.length) { out.innerHTML = ""; return; }

  const months = parseInt($("#route-months").value, 10);
  const style = $("#route-style").value;
  const styleIdx = style === "shoestring" ? 0 : 1;
  const budget = parseFloat($("#route-budget").value) || 0;
  const startMonth = parseInt($("#route-start-month").value, 10) || 0;
  const origin = ORIGINS[parseInt($("#builder-origin").value, 10)];
  const totalDays = months * 30;

  const ordered = orderCountries(origin, selectedCountries);

  // Split the days: scale each country's suggested stay, floor of 3 days.
  const suggestedSum = ordered.reduce((s, n) => s + COUNTRIES[n].days, 0);
  const alloc = ordered.map((n) => Math.max(3, Math.round(COUNTRIES[n].days / suggestedSum * totalDays)));
  let drift = totalDays - alloc.reduce((s, d) => s + d, 0);
  while (drift !== 0) {
    const i = alloc.indexOf(Math.max(...alloc));
    const step = drift > 0 ? 1 : (alloc[i] > 3 ? -1 : 0);
    if (step === 0) break;
    alloc[i] += step;
    drift -= step;
  }

  // Legs: origin -> each country -> origin.
  const stops = ordered.map((n) => ({ name: n, ...COUNTRIES[n] }));
  const points = [{ name: origin.name, ...origin }, ...stops, { name: origin.name, ...origin }];
  const legs = [];
  for (let i = 0; i < points.length - 1; i++) legs.push(legBetween(points[i], points[i + 1]));

  const transport = legs.reduce((s, l) => s + l.est, 0);
  const ground = ordered.reduce((s, n, i) => s + alloc[i] * COUNTRIES[n].daily[styleIdx], 0);
  const total = transport + ground;
  const avgDaily = ground / totalDays;

  let fitBadge = "";
  if (budget) {
    if (total <= budget) {
      fitBadge = `<div class="fit-badge fit-yes">✅ Fits your ${fmt(budget)} budget — ${fmt(budget - total)} to spare</div>`;
    } else {
      const affordableMonths = budget > transport ? (budget - transport) / (avgDaily * 30) : 0;
      const priciest = ordered.reduce((best, n, i) => {
        const cost = alloc[i] * COUNTRIES[n].daily[styleIdx];
        return cost > best.cost ? { name: n, cost } : best;
      }, { name: "", cost: 0 });
      fitBadge = affordableMonths >= 0.5
        ? `<div class="fit-badge fit-partial">⚠️ ${fmt(total - budget)} over budget at ${months} months — ${fmt(budget)} funds ~${affordableMonths.toFixed(1)} months of this route. Biggest lever: ${priciest.name} is your priciest stop (~${fmt(priciest.cost)} on the ground).</div>`
        : `<div class="fit-badge fit-no">❌ ${fmt(budget)} doesn't cover the transport alone (${fmt(transport)}) — trim the country list or start closer to home.</div>`;
    }
  }

  const avgStay = totalDays / ordered.length;
  const paceWarning = avgStay < 5
    ? `<p class="agent-tip">🏃 That's ${ordered.length} countries in ${months} month${months === 1 ? "" : "s"} — under ${Math.floor(avgStay)} days each once transit eats its share. Consider fewer countries or more time; slower is cheaper <em>and</em> better.</p>`
    : "";

  // ---- seasonal timing ----
  const dayOffsets = [];
  let acc = 0;
  for (let i = 0; i < ordered.length; i++) { dayOffsets.push(acc); acc += alloc[i]; }
  const visitMonth = (start, i) => ((start - 1 + Math.floor((dayOffsets[i] + alloc[i] / 2) / 30)) % 12) + 1;

  let bestScore = -1, bestM = 1;
  for (let m = 1; m <= 12; m++) {
    let sc = 0;
    for (let i = 0; i < ordered.length; i++) if ((COUNTRIES[ordered[i]].best || []).includes(visitMonth(m, i))) sc++;
    if (sc > bestScore) { bestScore = sc; bestM = m; }
  }
  const seasonNote = `<p class="agent-tip">🗓️ <strong>Best time to start:</strong> ${MON_FULL[bestM - 1]} — that lands ${bestScore} of ${ordered.length} ${ordered.length === 1 ? "country" : "countries"} in ideal season.${startMonth ? (startMonth === bestM ? ` You picked ${MON_FULL[startMonth - 1]} — nice, that's the sweet spot. ☀️` : ` You picked ${MON_FULL[startMonth - 1]} — check the badges below and consider shifting toward ${MON_FULL[bestM - 1]}.`) : ` Set “Leaving around” above and I'll season-check every stop.`}</p>`;

  const itinerary = legs.map((l, i) => {
    const fc = pointCode(l.from), tc = pointCode(l.to);
    const fareJump = (l.mode === "flight" && fc && tc)
      ? `<button type="button" class="btn btn-go route-jump" data-jump="flight" data-from="${fc}" data-to="${tc}">✈️ Live fares →</button>` : "";
    const legLine = `
      <li>
        <span class="leg-mode">${l.mode === "flight" ? "✈️" : "🚌"}</span>
        <span class="leg-desc"><strong>${l.from.name.split(" (")[0].split(",")[0]} → ${l.to.name.split(",")[0]}</strong>${l.to.gateway ? ` <span class="leg-note">(land in ${l.to.gateway})</span>` : ""} · ~${fmt(l.est)}<br>
        <span class="leg-note">${l.mode === "flight" ? `≈${l.km.toLocaleString("en-US")} km flight` : `≈${l.km.toLocaleString("en-US")} km overland — bus or train, book on 12Go`}</span></span>
        ${fareJump}
      </li>`;
    const stopIdx = i; // leg i arrives at stop i (last leg arrives home)
    if (stopIdx >= ordered.length) return legLine;
    const c = COUNTRIES[ordered[stopIdx]];
    const bestLabel = formatMonths(c.best || []);
    let seasonBadge = bestLabel ? `<span class="season-badge season-neutral">best: ${bestLabel}</span>` : "";
    if (startMonth && c.best) {
      const vm = visitMonth(startMonth, stopIdx);
      seasonBadge = c.best.includes(vm)
        ? `<span class="season-badge season-in">☀️ ${MON[vm - 1]}: in season</span>`
        : `<span class="season-badge season-off">🌧️ ${MON[vm - 1]}: off-season (ideal ${bestLabel})</span>`;
    }
    const stayCity = c.gateway.split(" (")[0];
    const stayLine = `
      <li class="stay-line">
        <span class="leg-mode">📍</span>
        <span class="leg-desc"><strong>${ordered[stopIdx]}</strong> — ${alloc[stopIdx]} days · ~${fmt(alloc[stopIdx] * c.daily[styleIdx])} on the ground (${fmt(c.daily[styleIdx])}/day ${style}) ${seasonBadge}</span>
        <button type="button" class="btn btn-go route-jump" data-jump="stay" data-city="${stayCity}">🛏️ Find stays →</button>
      </li>`;
    return legLine + stayLine;
  }).join("");

  out.innerHTML = `
    <div class="card route-card best">
      <div class="best-badge">🧭 Your custom route — ${ordered.length} countr${ordered.length === 1 ? "y" : "ies"}, ${months} month${months === 1 ? "" : "s"}</div>
      <h3>${origin.name.split(",")[0]} → ${ordered.map((n) => n).join(" → ")} → home</h3>
      <p class="tagline">Ordered to minimise backtracking from ${origin.name.split(",")[0]}. Same-region neighbours go overland; everything else flies.</p>
      <div class="route-toolbar">
        <button type="button" class="btn btn-go share-trip">🔗 Copy share link</button>
        <span class="save-note">💾 saved on this device automatically</span>
      </div>
      <ol class="legs">${itinerary}</ol>
      <div class="route-totals">
        <div><span class="price-label">Transport total (${legs.length} legs)</span><span class="price-big">${fmt(transport)}</span></div>
        <div><span class="price-label">${months} mo on the ground (${style})</span><span class="price-big">${fmt(ground)}</span></div>
        <div class="grand"><span class="price-label">Estimated trip total</span><span class="price-big">${fmt(total)}</span></div>
      </div>
      ${seasonNote}
      ${fitBadge}
      ${paceWarning}
      <p class="fine-print">Tap <strong>Live fares</strong> or <strong>Find stays</strong> on any leg to price it for real. Fare estimates come from a distance + regional-budget-carrier model; daily costs cover a ${style} bed, food, local transport and fun. Season windows are typical dry/pleasant months.</p>
    </div>`;
}

/* ---------- deal hacks + flex guide ---------- */
function renderHacks() {
  const flex = (section) => `
    <div class="card flex-card">
      <h3>${section.title}</h3>
      <ul class="flex-list">
        ${section.points.map((p) => `<li>${p}</li>`).join("")}
      </ul>
    </div>`;
  $("#flex-section").innerHTML = `
    <div class="card flex-intro">
      <h3>↩️ Stay flexible — book like plans will change</h3>
      <p>${FLEX_GUIDE.intro}</p>
    </div>
    <div class="flex-grid">
      ${flex(FLEX_GUIDE.flights)}
      ${flex(FLEX_GUIDE.stays)}
    </div>`;

  $("#hacks-grid").innerHTML = DEAL_HACKS.map((h) => `
    <div class="card hack-card">
      <div class="hack-icon">${h.icon}</div>
      <h3>${h.title}</h3>
      <p>${h.body}</p>
    </div>`).join("");
}

/* ---------- init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  populateCityDatalist();
  populateStayDatalist();
  populateBuilderInputs();
  initLiveSetup();
  renderHacks();
  renderRoutes();

  // sensible default dates: ~2 months out, 1-week stay
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  const plusDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const iso = (d) => d.toISOString().slice(0, 10);
  $("#fly-depart").value = iso(soon);
  $("#stay-in").value = iso(soon);
  $("#stay-out").value = iso(plusDays(soon, 7));

  $("#flight-form").addEventListener("submit", (e) => { e.preventDefault(); renderFlightResult(); });
  $("#stay-form").addEventListener("submit", (e) => { e.preventDefault(); renderStayResult(); });
  $("#fly-swap").addEventListener("click", () => {
    const a = $("#fly-from").value;
    $("#fly-from").value = $("#fly-to").value;
    $("#fly-to").value = a;
  });
  $("#stay-budget").addEventListener("input", () => {
    $("#stay-budget-label").textContent = fmt($("#stay-budget").value) + "/night";
  });
  const rerenderAllRoutes = () => { renderRoutes(); renderCustomRoute(); };
  $("#route-months").addEventListener("input", rerenderAllRoutes);
  $("#route-style").addEventListener("change", rerenderAllRoutes);
  $("#route-region").addEventListener("change", renderRoutes);
  $("#route-budget").addEventListener("input", rerenderAllRoutes);
  $("#route-start-month").addEventListener("change", renderCustomRoute);

  // Jump from a route leg/stop into the live Flights / Stays tabs, or share.
  $("#custom-route-result").addEventListener("click", (e) => {
    const share = e.target.closest(".share-trip");
    if (share) { copyShare(share); return; }
    const btn = e.target.closest(".route-jump");
    if (!btn) return;
    if (btn.dataset.jump === "flight") goToFlights(btn.dataset.from, btn.dataset.to);
    else goToStays(btn.dataset.city);
  });

  $("#builder-add").addEventListener("click", addCountry);
  $("#builder-country").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addCountry(); }
  });
  // Datalist picks fire 'change' — add immediately so it feels instant.
  $("#builder-country").addEventListener("change", () => {
    const v = $("#builder-country").value.trim().toLowerCase();
    if (Object.keys(COUNTRIES).some((n) => n.toLowerCase() === v)) addCountry();
  });
  $("#builder-origin").addEventListener("change", renderCustomRoute);
  $("#builder-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const i = selectedCountries.indexOf(chip.dataset.country);
    if (i >= 0) selectedCountries.splice(i, 1);
    renderChips();
    renderCustomRoute();
  });

  // Deep links from the static guide pages: ?from=LAX&to=SYD and ?city=Bangkok
  const qp = new URLSearchParams(location.search);
  const codeToValue = (v) => {
    const hit = resolveCity(v);
    return hit && hit.code ? `${hit.name} (${hit.code})` : v;
  };
  if (qp.get("from")) $("#fly-from").value = codeToValue(qp.get("from"));
  if (qp.get("to")) $("#fly-to").value = codeToValue(qp.get("to"));
  if (qp.get("city")) {
    $("#stay-city").value = qp.get("city");
    $('[data-panel="panel-stays"]').click();
  }

  // Restore a shared trip from the URL, else the last one saved on this device.
  let restored = false;
  if (qp.get("countries")) {
    restored = applyTrip({
      countries: qp.get("countries").split(",").map((s) => s.trim()).filter(Boolean),
      origin: qp.get("origin"), months: qp.get("months"), style: qp.get("style"),
      budget: qp.get("budget"), start: qp.get("start"),
    });
    if (restored) $('[data-panel="panel-routes"]').click();
  }
  if (!restored && !qp.get("from") && !qp.get("to") && !qp.get("city")) {
    try {
      const saved = JSON.parse(localStorage.getItem("bb-trip") || "null");
      if (saved) restored = applyTrip(saved);
    } catch { /* ignore */ }
  }

  renderFlightResult();
  renderStayResult();
  renderRoutes();
  renderCustomRoute();
});
