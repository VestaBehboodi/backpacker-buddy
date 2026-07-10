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

  out.innerHTML = `
    <div class="card result-card">
      <h3>${from.name} → ${to.name}</h3>
      ${intel}
      ${corridorExtra}
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Live prices on ${l.name} ↗</a>`).join("")}
      </div>
      <p class="fine-print">Estimates are typical one-way USD fares from budget-carrier sale history. The buttons above open today's live prices for your dates.</p>
    </div>`;
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
        <div class="link-row">
          ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Search ${l.name} ↗</a>`).join("")}
        </div>
      </div>`;
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
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Search ${l.name} ↗</a>`).join("")}
      </div>
    </div>`;
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
  $("#route-months").addEventListener("input", renderRoutes);
  $("#route-style").addEventListener("change", renderRoutes);
  $("#route-region").addEventListener("change", renderRoutes);
  $("#route-budget").addEventListener("input", renderRoutes);

  renderFlightResult();
  renderStayResult();
});
