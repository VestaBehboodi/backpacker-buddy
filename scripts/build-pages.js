#!/usr/bin/env node
/* =========================================================================
   Backpacker Buddy — static guide-page generator

   Reads js/data.js and emits SEO-friendly static pages:
     guides/index.html          hub linking everything
     routes/<a>-to-<b>.html     one per curated flight deal
     cities/<city>.html         one per stay guide
     trips/<strategy>.html      one per classic route strategy
     sitemap.xml                for search engines

   Run:  node scripts/build-pages.js
   The Pages deploy workflow runs this automatically before publishing,
   so generated files never need to be committed.
   ========================================================================= */

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* Swap this when the custom domain goes live. */
const SITE_BASE = "https://vestabehboodi.github.io/backpacker-buddy";

const ROOT = path.join(__dirname, "..");

/* data.js defines plain consts — evaluate it in a sandbox and pull them out. */
const sandbox = {};
vm.createContext(sandbox);
const dataSource = fs.readFileSync(path.join(ROOT, "js", "data.js"), "utf8");
const { REGIONS, FLIGHT_DEALS, CORRIDORS, STAYS, ROUTE_STRATEGIES, COUNTRIES } = vm.runInContext(
  dataSource + "\n;({ REGIONS, FLIGHT_DEALS, CORRIDORS, STAYS, ROUTE_STRATEGIES, COUNTRIES });",
  sandbox
);

const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtRange = ([a, b]) => `${fmt(a)}–${fmt(b)}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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

/* Shared page shell — reuses the app stylesheet so guides match the app. */
function page({ depth, title, description, canonicalPath, body }) {
  const rel = "../".repeat(depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE_BASE}/${canonicalPath}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${SITE_BASE}/${canonicalPath}">
  <meta name="theme-color" content="#0e7c66">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎒</text></svg>">
  <link rel="stylesheet" href="${rel}css/styles.css">
  <style>
    .guide-wrap { max-width: 760px; margin: 0 auto 4rem; padding: 0 1rem; }
    .guide-hero { padding-bottom: 2.2rem; }
    .guide-hero .crumb { font-size: 0.85rem; opacity: 0.85; }
    .guide-hero .crumb a { color: #fff; }
    article.card h2 { font-size: 1.15rem; margin: 1.1rem 0 0.4rem; }
    article.card p { margin: 0.5rem 0; }
    .related { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.6rem; }
    .related a { font-size: 0.9rem; text-decoration: none; }
  </style>
</head>
<body>
  <header class="hero guide-hero">
    <p class="crumb"><a href="${rel}index.html">🎒 Backpacker Buddy</a> · <a href="${rel}guides/index.html">Trip guides</a></p>
    <h1>${esc(title)}</h1>
  </header>
  <main class="guide-wrap">
    ${body}
  </main>
  <footer>
    <p>Prices are planning estimates from budget-carrier sale history — live prices are one click away in the
    <a href="${rel}index.html">Backpacker Buddy app</a>. Some links earn us a small commission at no extra cost to you.</p>
  </footer>
</body>
</html>
`;
}

const out = (rel, content) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return rel;
};

const pages = []; // canonical paths for the sitemap

/* ---------- route pages ---------- */
const routeMeta = [];
for (const deal of FLIGHT_DEALS) {
  const a = cityByCode(deal.pair[0]);
  const b = cityByCode(deal.pair[1]);
  if (!a || !b) continue;
  const slug = `${slugify(a.name)}-to-${slugify(b.name)}`;
  const relPath = `routes/${slug}.html`;
  const corridor = CORRIDORS[corridorKey(a.region, b.region)];
  const title = `Cheap flights ${a.name} to ${b.name} — deals from ${fmt(deal.low)}`;
  const description = `Typical low fares ${a.name} (${a.code}) ↔ ${b.name} (${b.code}): ${fmtRange(deal.typ)} one-way, great sales near ${fmt(deal.low)}. Budget airlines: ${deal.airlines}.`.slice(0, 300);

  const siblings = FLIGHT_DEALS.filter((d) => d !== deal &&
    (d.pair.includes(deal.pair[0]) || d.pair.includes(deal.pair[1]))).slice(0, 6);

  const body = `
    <article class="card">
      <div class="price-row">
        <div class="price-block"><span class="price-label">Great sale fare</span><span class="price-big">${fmt(deal.low)}</span><span class="price-sub">one-way</span></div>
        <div class="price-block"><span class="price-label">Typical low fare</span><span class="price-big">${fmtRange(deal.typ)}</span><span class="price-sub">one-way</span></div>
      </div>
      <h2>Which airlines fly it cheapest</h2>
      <p>${esc(deal.airlines)}.</p>
      <h2>The local trick</h2>
      <p class="agent-tip">💡 ${esc(deal.note)}</p>
      ${corridor ? `<h2>Corridor intel — ${esc(corridor.label)}</h2><p>${esc(corridor.advice)}</p>` : ""}
      <div class="link-row">
        <a class="btn btn-primary" href="../index.html?from=${a.code}&to=${b.code}">Check live prices in the app →</a>
      </div>
      ${siblings.length ? `<h2>Related routes</h2><div class="related">${siblings.map((d) => {
        const x = cityByCode(d.pair[0]), y = cityByCode(d.pair[1]);
        return `<a class="btn btn-go" href="${slugify(x.name)}-to-${slugify(y.name)}.html">${esc(x.name)} → ${esc(y.name)}</a>`;
      }).join("")}</div>` : ""}
    </article>`;

  out(relPath, page({ depth: 1, title, description, canonicalPath: relPath, body }));
  pages.push(relPath);
  routeMeta.push({ relPath, label: `${a.name} → ${b.name}`, low: deal.low });
}

/* ---------- city pages ---------- */
const cityMeta = [];
for (const [city, s] of Object.entries(STAYS)) {
  const slug = slugify(city);
  const relPath = `cities/${slug}.html`;
  const country = COUNTRIES && COUNTRIES[s.country];
  const title = `${city}, ${s.country} on a budget — hostel & hotel prices`;
  const description = `What a clean bed really costs in ${city}: dorms ${fmtRange(s.dorm)}, private rooms ${fmtRange(s.private)}, budget hotels ${fmtRange(s.hotel)} per night — plus where to stay and how to pick a clean place.`.slice(0, 300);

  const siblings = Object.keys(STAYS).filter((c) => c !== city && STAYS[c].country === s.country);
  const body = `
    <article class="card">
      <h2>What a night costs</h2>
      <table class="price-table">
        <tr><td>🛏️ Hostel dorm bed</td><td class="num">${fmtRange(s.dorm)}<span class="price-sub">/night</span></td></tr>
        <tr><td>🚪 Private room (hostel/guesthouse)</td><td class="num">${fmtRange(s.private)}<span class="price-sub">/night</span></td></tr>
        <tr><td>🏨 Budget hotel / Airbnb room</td><td class="num">${fmtRange(s.hotel)}<span class="price-sub">/night</span></td></tr>
      </table>
      ${country ? `<p>Full backpacker daily budget for ${esc(s.country)} (bed + food + local transport + fun): about <strong>${fmt(country.daily[0])}/day</strong> shoestring or <strong>${fmt(country.daily[1])}/day</strong> flashpacker.</p>` : ""}
      <h2>Where to stay</h2>
      <p>${esc(s.areas)}</p>
      <h2>Local tip</h2>
      <p class="agent-tip">💡 ${esc(s.tip)}</p>
      <h2>The clean-bed formula</h2>
      <p>Filter to rating ≥ 8.3 with 150+ reviews, then read the recent negative reviews — that's where the cleanliness truth lives. Prefer free-cancellation rates; plans change, especially yours.</p>
      <div class="link-row">
        <a class="btn btn-primary" href="../index.html?city=${encodeURIComponent(city)}">Search live stays in the app →</a>
      </div>
      ${siblings.length ? `<h2>More in ${esc(s.country)}</h2><div class="related">${siblings.map((c) => `<a class="btn btn-go" href="${slugify(c)}.html">${esc(c)}</a>`).join("")}</div>` : ""}
    </article>`;

  out(relPath, page({ depth: 1, title, description, canonicalPath: relPath, body }));
  pages.push(relPath);
  cityMeta.push({ relPath, label: `${city}, ${s.country}` });
}

/* ---------- trip strategy pages ---------- */
const tripMeta = [];
for (const r of ROUTE_STRATEGIES) {
  const relPath = `trips/${r.id}.html`;
  const flightTotal = r.legs.reduce((s, l) => s + l.est, 0);
  const title = `${r.name}: a money-saving ${r.regionLabel} backpacking route`;
  const description = `${r.tagline} Leg-by-leg costs (~${fmt(flightTotal)} transport), daily budgets from ${fmt(r.daily.shoestring)}/day, and why this order saves money.`.slice(0, 300);
  const body = `
    <article class="card">
      <p class="tagline">${esc(r.tagline)}</p>
      <h2>The route, leg by leg</h2>
      <ol class="legs">
        ${r.legs.map((l) => `<li><span class="leg-mode">${l.mode === "flight" ? "✈️" : "🚌"}</span>
          <span class="leg-desc"><strong>${esc(l.from)}${l.to ? " → " + esc(l.to) : ""}</strong> · ~${fmt(l.est)}<br>
          <span class="leg-note">${esc(l.note)}</span></span></li>`).join("")}
      </ol>
      <p><strong>Transport total:</strong> about ${fmt(flightTotal)}. <strong>Daily budget:</strong> ${fmt(r.daily.shoestring)}/day shoestring, ${fmt(r.daily.flashpacker)}/day flashpacker.</p>
      <h2>Why it saves money</h2>
      <p class="agent-tip">💰 ${esc(r.why)}</p>
      <div class="link-row">
        <a class="btn btn-primary" href="../index.html">Price this trip for your budget in the app →</a>
      </div>
      <h2>Other classic routes</h2>
      <div class="related">${ROUTE_STRATEGIES.filter((x) => x.id !== r.id).map((x) => `<a class="btn btn-go" href="${x.id}.html">${x.emoji} ${esc(x.name)}</a>`).join("")}</div>
    </article>`;

  out(relPath, page({ depth: 1, title, description, canonicalPath: relPath, body }));
  pages.push(relPath);
  tripMeta.push({ relPath, label: `${r.emoji} ${r.name}` });
}

/* ---------- guides hub ---------- */
{
  const relPath = "guides/index.html";
  const body = `
    <article class="card">
      <p>Everything Backpacker Buddy knows, in linkable form: what routes really cost, where to sleep cheaply
      and cleanly, and the classic money-saving ways around the world. For live prices and the custom route
      planner, head to <a href="../index.html">the app</a>.</p>
      <h2>✈️ Flight route guides</h2>
      <div class="related">${routeMeta.map((m) => `<a class="btn btn-go" href="../${m.relPath}">${esc(m.label)} · from ${fmt(m.low)}</a>`).join("")}</div>
      <h2>🛏️ City stay guides</h2>
      <div class="related">${cityMeta.map((m) => `<a class="btn btn-go" href="../${m.relPath}">${esc(m.label)}</a>`).join("")}</div>
      <h2>🗺️ Classic trip routes</h2>
      <div class="related">${tripMeta.map((m) => `<a class="btn btn-go" href="../${m.relPath}">${esc(m.label)}</a>`).join("")}</div>
    </article>`;
  out(relPath, page({
    depth: 1,
    title: "Backpacker trip guides — routes, cities and costs",
    description: "Free backpacker guides: what flights really cost on 30+ budget routes, hostel and hotel prices in 45+ cities, and six classic money-saving routes around the world.",
    canonicalPath: relPath,
    body,
  }));
  pages.push(relPath);
}

/* ---------- sitemap + robots ---------- */
out("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", ...pages].map((p) => `  <url><loc>${SITE_BASE}/${p}</loc></url>`).join("\n")}
</urlset>
`);
out("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_BASE}/sitemap.xml\n`);

console.log(`Generated ${pages.length} pages + sitemap.xml + robots.txt`);
