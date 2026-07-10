/* Backpacker Buddy — app logic */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtRange = ([a, b]) => `${fmt(a)}–${fmt(b)}`;

function cityByCode(code) {
  for (const region of REGIONS) {
    const hit = region.cities.find((c) => c.code === code);
    if (hit) return { ...hit, region: region.id, regionName: region.name };
  }
  return null;
}

function corridorKey(a, b) {
  const order = ["california", "australia", "sea"];
  const [x, y] = [a, b].sort((p, q) => order.indexOf(p) - order.indexOf(q));
  return `${x}-${y}`;
}

function findDeal(a, b) {
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
function populateCitySelects() {
  const make = (select) => {
    REGIONS.forEach((region) => {
      const group = document.createElement("optgroup");
      group.label = region.name;
      region.cities.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = `${c.name} (${c.code})`;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
  };
  make($("#fly-from"));
  make($("#fly-to"));
  $("#fly-from").value = "LAX";
  $("#fly-to").value = "SYD";
}

function flightLinks(from, to, depart, ret) {
  const gq = `Flights from ${from} to ${to}` +
    (depart ? ` on ${depart}` : "") + (ret ? ` returning ${ret}` : "");
  const sky = (d) => (d ? d.replaceAll("-", "").slice(2) : "");
  const links = [
    { name: "Google Flights", url: `https://www.google.com/travel/flights?q=${encodeURIComponent(gq + (ret ? "" : " one way"))}` },
    { name: "Skyscanner", url: `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${sky(depart)}/${ret ? sky(ret) + "/" : ""}` },
    { name: "Kiwi.com", url: `https://www.kiwi.com/en/search/results/${from.toLowerCase()}/${to.toLowerCase()}/${depart || "anytime"}/${ret || "no-return"}` },
  ];
  return links;
}

function renderFlightResult() {
  const from = $("#fly-from").value;
  const to = $("#fly-to").value;
  const depart = $("#fly-depart").value;
  const ret = $("#fly-return").value;
  const out = $("#flight-result");

  if (from === to) {
    out.innerHTML = `<div class="card notice">Pick two different cities and I'll get to work. 😉</div>`;
    return;
  }

  const cFrom = cityByCode(from);
  const cTo = cityByCode(to);
  const deal = findDeal(from, to);
  const corridor = CORRIDORS[corridorKey(cFrom.region, cTo.region)];
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
  }

  const corridorExtra = deal && corridor ? `<p class="corridor-note">🧭 <strong>${corridor.label}:</strong> ${corridor.advice}</p>` : "";

  out.innerHTML = `
    <div class="card result-card">
      <h3>${cFrom.name} → ${cTo.name}</h3>
      ${intel}
      ${corridorExtra}
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Live prices on ${l.name} ↗</a>`).join("")}
      </div>
      <p class="fine-print">Estimates are typical one-way USD fares from budget-carrier sale history. The buttons above open today's live prices for your dates.</p>
    </div>`;
}

/* ---------- stays ---------- */
function populateStayCities() {
  const sel = $("#stay-city");
  Object.keys(STAYS).forEach((city) => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = `${city}, ${STAYS[city].country}`;
    sel.appendChild(opt);
  });
  sel.value = "Bangkok";
}

function stayLinks(city, country, checkin, checkout, maxPrice) {
  const q = encodeURIComponent(`${city}, ${country}`);
  const links = [
    { name: "Hostelworld", url: `https://www.hostelworld.com/search?search_keywords=${q}${checkin ? `&date_from=${checkin}&date_to=${checkout || checkin}` : ""}&number_of_guests=1` },
    { name: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${q}${checkin ? `&checkin=${checkin}&checkout=${checkout || checkin}` : ""}&group_adults=1&no_rooms=1&nflt=${encodeURIComponent("review_score=80")}` },
    { name: "Agoda", url: `https://www.agoda.com/search?textToSearch=${q}${checkin ? `&checkIn=${checkin}` : ""}&adults=1&rooms=1&sort=priceLowToHigh` },
    { name: "Airbnb", url: `https://www.airbnb.com/s/${q}/homes?adults=1${checkin ? `&checkin=${checkin}&checkout=${checkout || checkin}` : ""}${maxPrice ? `&price_max=${maxPrice}` : ""}` },
  ];
  return links;
}

function renderStayResult() {
  const city = $("#stay-city").value;
  const checkin = $("#stay-in").value;
  const checkout = $("#stay-out").value;
  const budget = parseInt($("#stay-budget").value, 10);
  const s = STAYS[city];
  const out = $("#stay-result");
  const links = stayLinks(city, s.country, checkin, checkout, budget);

  const fits = (range) => budget >= range[0];
  const rows = [
    { label: "🛏️ Hostel dorm bed", range: s.dorm },
    { label: "🚪 Private room (hostel/guesthouse)", range: s.private },
    { label: "🏨 Budget hotel / Airbnb room", range: s.hotel },
  ];

  out.innerHTML = `
    <div class="card result-card">
      <h3>${city}, ${s.country}</h3>
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
      <div class="link-row">
        ${links.map((l) => `<a class="btn btn-go" href="${l.url}" target="_blank" rel="noopener">Search ${l.name} ↗</a>`).join("")}
      </div>
    </div>`;
}

/* ---------- routes ---------- */
function renderRoutes() {
  const months = parseInt($("#route-months").value, 10);
  const style = $("#route-style").value;
  $("#route-months-label").textContent = months + (months === 1 ? " month" : " months");
  const daily = DAILY_BUDGET[style];
  const days = months * 30;
  const out = $("#route-results");

  const cards = ROUTE_STRATEGIES.map((r) => {
    const flightTotal = r.legs.reduce((sum, l) => sum + l.est, 0);
    const groundDaily = days * (r.auShare * daily.australia + (1 - r.auShare) * daily.sea);
    const total = flightTotal + groundDaily;
    return { r, flightTotal, groundDaily, total };
  }).sort((a, b) => a.total - b.total);

  const cheapest = cards[0].total;

  out.innerHTML = cards.map(({ r, flightTotal, groundDaily, total }, i) => `
    <div class="card route-card ${i === 0 ? "best" : ""}">
      ${i === 0 ? `<div class="best-badge">🏆 Cheapest for your trip</div>` : `<div class="delta-badge">+${fmt(total - cheapest)} vs cheapest</div>`}
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
        <div><span class="price-label">${months} mo on the ground (${style})</span><span class="price-big">${fmt(groundDaily)}</span></div>
        <div class="grand"><span class="price-label">Estimated trip total</span><span class="price-big">${fmt(total)}</span></div>
      </div>
      <p class="agent-tip">💰 <strong>Why it saves money:</strong> ${r.why}</p>
    </div>`).join("");
}

/* ---------- deal hacks ---------- */
function renderHacks() {
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
  populateCitySelects();
  populateStayCities();
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

  renderFlightResult();
  renderStayResult();
});
