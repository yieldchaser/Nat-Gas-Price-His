// App shell: loads datasets, builds market models, routes between views and
// renders the global data-status bar.

import { FxSeries, Market, decodeSpot } from './lib/market.js';
import { marketSignals } from './lib/analytics.js';
import { priceState } from './lib/session.js';
import { ChartRegistry } from './ui/charts.js';
import { esc } from './ui/dom.js';
import * as F from './ui/format.js';

import overview from './views/overview.js';
import contracts from './views/contracts.js';
import curve from './views/curve.js';
import spreads from './views/spreads.js';
import seasonality from './views/seasonality.js';
import settlements from './views/settlements.js';

const VIEWS = [overview, contracts, curve, spreads, seasonality, settlements];
const byId = Object.fromEntries(VIEWS.map(v => [v.id, v]));

const ctx = { charts: new ChartRegistry(), warnings: [] };
window.__bf = ctx;   // handy for debugging in the console (ctx.poll() forces a live check)

function progress(pct, msg) {
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.width = `${pct}%`;
  if (msg) document.getElementById('boot-msg').textContent = msg;
}

async function getJSON(url, { optional = false, bust = false } = {}) {
  try {
    // no-cache = revalidate with the server (cheap 304 when unchanged);
    // bust adds a query string so CDN copies of fast-changing files are skipped.
    const res = await fetch(bust ? `${url}?t=${Date.now()}` : url, { cache: bust ? 'no-store' : 'no-cache' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (optional) { console.warn(e); return null; }
    throw e;
  }
}

async function waitForCharts(ms = 8000) {
  const t0 = Date.now();
  while (!window.LightweightCharts) {
    if (Date.now() - t0 > ms) throw new Error('Charting library failed to load (unpkg and jsDelivr unreachable).');
    await new Promise(r => setTimeout(r, 50));
  }
}

async function load({ boot = true } = {}) {
  if (boot) progress(10, 'Loading contract archive…');
  const [hh, ttf, spot, fx, feed] = await Promise.all([
    getJSON('data/hh.json'),
    getJSON('data/ttf.json', { optional: true }),
    getJSON('data/spot.json', { optional: true }),
    getJSON('data/fx_eurusd.json', { optional: true }),
    getJSON('data/live_quotes.json', { optional: true, bust: true }),
  ]);
  if (boot) progress(60, 'Building market models…');
  await new Promise(r => setTimeout(r, 0));
  const today = new Date().toISOString().slice(0, 10);
  const quotes = feed && feed.quotes ? feed.quotes : null;
  ctx.warnings = [];
  ctx.today = today;
  ctx.feedMeta = feed ? feed.meta : null;
  ctx.hh = new Market('HH', hh, quotes, today);
  ctx.ttf = ttf ? new Market('TTF', ttf, quotes, today) : null;
  ctx.spot = decodeSpot(spot);
  ctx.fx = new FxSeries(fx);
  ctx.archiveMeta = { hh: hh.meta, ttf: ttf && ttf.meta };
  if (!feed) ctx.warnings.push({ level: 'warn', text: '<b>Live feed unavailable.</b> Showing the contract archive only; active contracts may lag.' });
  if (!ttf) ctx.warnings.push({ level: 'warn', text: '<b>TTF data unavailable.</b> TTF panels are hidden.' });
  // A scheduled job that has silently stopped must not look like a quiet market.
  const feedAge = feed && feed.meta && feed.meta.updatedTimestamp ? Date.now() - feed.meta.updatedTimestamp : null;
  if (feedAge != null && feedAge > 4 * 86400e3) {
    ctx.warnings.push({ level: 'err', text: `<b>Prices are stale.</b> The live feed last updated ${F.relativeAge(feedAge)} (${esc(new Date(feed.meta.updatedTimestamp).toUTCString())}); the scheduled refresh job may be failing — check the repository's Actions tab.` });
  }
  if (boot) progress(80, 'Computing signals…');
  ctx.signals = marketSignals(ctx.hh, { ttf: ctx.ttf, fx: ctx.fx, spot: ctx.spot, today });
  ctx.state = priceState(ctx.signals.asOf, ctx.feedMeta && ctx.feedMeta.updatedTimestamp);
  if (boot) { await waitForCharts(); progress(100, 'Ready'); }
}

// ── Live refresh ───────────────────────────────────────────────────────
// The browser polls data/latest.json (~300 bytes) every minute while the tab
// is visible. When the feed has a newer timestamp, everything is reloaded
// (unchanged archive files revalidate as cheap 304s) and the current view is
// re-rendered in place, keeping the scroll position and view parameters.
const POLL_MS = 60 * 1000;
let refreshing = false;
ctx.poll = () => poll();
async function poll() {
  if (document.hidden || refreshing) return;
  const hb = await getJSON('data/latest.json', { optional: true, bust: true });
  const have = ctx.feedMeta && ctx.feedMeta.updatedTimestamp;
  if (hb && hb.updatedTimestamp && (!have || hb.updatedTimestamp > have)) {
    refreshing = true;
    try {
      const y = window.scrollY;
      await load({ boot: false });
      route();
      window.scrollTo(0, y);
      ctx.lastRefresh = Date.now();
    } catch (e) {
      console.warn('Live refresh failed; keeping current data', e);
    } finally {
      refreshing = false;
    }
  }
  if (ctx.signals) {
    ctx.state = priceState(ctx.signals.asOf, ctx.feedMeta && ctx.feedMeta.updatedTimestamp);
    renderStatus();
  }
}

function renderStatus() {
  const s = ctx.signals;
  const st = ctx.state || {};
  const ch = s.change1d;
  const m = ctx.feedMeta;
  const age = m && m.updatedTimestamp ? Date.now() - m.updatedTimestamp : null;
  let dot, label, tip;
  if (age != null && age > 4 * 86400e3) {
    dot = 'err'; label = `stale · updated ${F.relativeAge(age)}`; tip = 'The live feed has not updated for more than 4 days.';
  } else if (!m) {
    dot = 'err'; label = 'archive only'; tip = 'The live feed could not be loaded; prices are from the daily archive.';
  } else if (st.live) {
    dot = st.stale ? 'stale' : 'live';
    label = `live · updated ${F.relativeAge(age)}`;
    tip = `Intraday prices from Yahoo Finance (NYMEX, delayed ~10 min). Feed generated ${new Date(m.updatedTimestamp).toUTCString()}. Checks for updates every minute.`;
  } else {
    dot = st.open && st.stale ? 'stale' : '';
    label = st.open ? `close ${F.date(s.asOf, true)} · updated ${F.relativeAge(age)}` : `market closed · close ${F.date(s.asOf, true)}`;
    tip = `Latest prices are the ${F.date(s.asOf)} close. Feed generated ${new Date(m.updatedTimestamp).toUTCString()}.`;
  }
  if (st.stale) tip += ' The feed has not updated for over 45 minutes while the market is open (GitHub may have delayed the scheduled refresh).';
  document.getElementById('status').innerHTML = `
    <span title="Front-month Henry Hub (${esc(s.front.ticker)}): ${st.live ? 'latest intraday price' : 'latest close'}, change vs the same contract's previous close (${esc(ch ? ch.prevDate : '')})">
      <span class="muted">${esc(s.front.ticker)}</span>
      <span class="quote">${F.price(s.price)}</span>
      <span class="${F.toneOf(ch && ch.pct)} num">${ch ? F.signedPct(ch.pct, 2) : ''}</span>
    </span>
    <span title="${esc(tip)}"><span class="dot ${dot}"></span>${esc(label)}</span>`;
}

function renderNav(active) {
  document.getElementById('nav').innerHTML = VIEWS.map(v =>
    `<a href="#/${v.id}" class="${v.id === active ? 'on' : ''}" ${v.id === active ? 'aria-current="page"' : ''}>${v.title}</a>`).join('');
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { id: byId[path] ? path : 'overview', params };
}

/** Navigate to a view; params are encoded in the hash so views are linkable. */
ctx.navigate = (id, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const target = `#/${id}${q ? `?${q}` : ''}`;
  if (location.hash === target) route(); else location.hash = target;
};
/** Update the current view's params without re-rendering. */
ctx.setParams = (params) => {
  const { id, params: cur } = parseHash();
  const merged = { ...cur, ...params };
  const q = new URLSearchParams(Object.entries(merged).filter(([, v]) => v != null && v !== '')).toString();
  history.replaceState(null, '', `#/${id}${q ? `?${q}` : ''}`);
};

let current = null;
function route() {
  const { id, params } = parseHash();
  ctx.charts.clear();
  if (current && current.destroy) current.destroy();
  current = byId[id];
  renderNav(id);
  const main = document.getElementById('view');
  const banners = ctx.warnings.map(w => `<div class="banner ${w.level === 'err' ? 'err' : ''}">${w.text}</div>`).join('');
  main.innerHTML = banners + '<div id="view-root"></div>';
  try {
    current.render(document.getElementById('view-root'), ctx, params);
  } catch (e) {
    console.error(e);
    document.getElementById('view-root').innerHTML = `<div class="banner err"><b>This view failed to render.</b> ${esc(e.message)}</div>`;
  }
  document.title = `${current.title} · Blue Flux`;
}

(async () => {
  try {
    await load();
    renderStatus();
    window.addEventListener('hashchange', route);
    route();
    setInterval(poll, POLL_MS);
    setInterval(() => { if (ctx.signals) renderStatus(); }, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  } catch (e) {
    console.error(e);
    document.getElementById('view').innerHTML = `<div class="banner err"><b>Could not load market data.</b> ${esc(e.message)}</div>`;
  } finally {
    const boot = document.getElementById('boot');
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 300);
  }
})();
