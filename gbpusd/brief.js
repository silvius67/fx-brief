// GBP/USD brief - compact single-file build for cloud routines.
//
// Deliberately written small rather than machine-minified from the module tree:
// this file has to be reproduced verbatim inside a routine prompt, and short
// readable code survives that far better than 22KB of base64. The module tree in
// ../src is the reference implementation; this keeps the same sources, the same
// scoring weights and the same indicator scales.
//
// Node 18+, no dependencies. Usage: node brief.js [--slot 12:00|16:00|17:15]

const TZ = 'Europe/Bucharest';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const W = { events: 0.34, macro: 0.20, dxy: 0.20, news: 0.11, technical: 0.15 };

const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => (v == null || Number.isNaN(v) ? null : +v.toFixed(n));
const num = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const sgn = (v, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const warnings = [];

async function get(url, json, headers) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...(headers || {}) }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? res.json() : res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 900 * (i + 1)));
    }
  }
}

// --- timezone helpers -------------------------------------------------------

function tzOffset(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(ts).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}

function zonedToUtc(y, m, d, h, tz) {
  const naive = Date.UTC(y, m - 1, d, h, 0);
  let ts = naive;
  for (let i = 0; i < 3; i++) ts = naive - tzOffset(ts, tz);
  return ts;
}

function dateParts(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ts).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}

// Most recent instant at or before `now` when the clock in `tz` read `hour:00`.
function lastLocalHour(now, hour, tz) {
  for (let b = 0; b < 5; b++) {
    const { y, m, d } = dateParts(now - b * 86400000, tz);
    const ts = zonedToUtc(y, m, d, hour, tz);
    if (ts <= now) return ts;
  }
  return null;
}

const fmt = ts => new Intl.DateTimeFormat('ro-RO', {
  timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(ts);

// Parse feed values like "225K", "-3.4B", "0.8%".
function parseNum(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;
  const m = s.match(/^(<|>)?\s*(-?[\d,]*\.?\d+)\s*([KMBT%])?/i);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ''));
  if (Number.isNaN(v)) return null;
  // K and B stay in their native units (NFP in thousands, trade balance in billions).
  return (m[3] || '').toUpperCase() === 'M' ? v * 1000 : v;
}

// --- indicator registry -----------------------------------------------------
// sign: +1 when a higher-than-expected print is bullish for that country's currency.
// scale: the typical absolute miss vs consensus, used to normalise surprises.

const IND = [
  ['BOE_RATE', 'GBP', /official bank rate|boe.*rate|bank rate/i, 0.25, 1],
  ['UK_RETAIL', 'GBP', /retail sales/i, 0.40, 1],
  ['UK_CLAIMANT', 'GBP', /claimant count/i, 15.0, -1],
  ['UK_GDP', 'GBP', /\bgdp\b/i, 0.20, 1],
  ['UK_INDPROD', 'GBP', /industrial production|manufacturing production/i, 0.50, 1],
  ['FED_RATE', 'USD', /federal funds rate|fomc statement|fomc.*rate/i, 0.25, 1],
  ['US_RETAIL', 'USD', /retail sales/i, 0.40, 1],
  ['US_NFP', 'USD', /non-?farm (employment change|payrolls)/i, 60.0, 1],
  ['US_GDP', 'USD', /\bgdp\b/i, 0.30, 1],
  ['US_TRADE', 'USD', /trade balance/i, 5.00, 1],
  ['US_CONFIDENCE', 'USD', /consumer confidence|consumer sentiment/i, 4.00, 1],
  ['US_ISM_MFG', 'USD', /ism manufacturing pmi/i, 1.50, 1],
  ['US_ISM_SVC', 'USD', /ism services pmi|ism non-?manufacturing/i, 1.50, 1],
  ['CPI', null, /\bcpi\b|inflation rate|core pce price index/i, 0.15, 1],
  ['UNEMP', null, /unemployment rate/i, 0.15, -1],
  ['TRADE', null, /trade balance/i, 5.00, 1],
];

const classify = (title, cc) => IND.find(i => (i[1] === null || i[1] === cc) && i[2].test(title)) || null;

// Uncurated feed rows with no macro signal for a currency pair.
const NOISE = /(bond|bill|note) yield|auction|^calendar$|mba |mortgage (refinance|market|applications|rate)|purchase index|redbook|api weekly|used car|inflation expectations|cushing|baker hughes|treasury (buyback|announcement)/i;
const TIER = { High: 3, Medium: 2, Low: 1 };

// --- prices -----------------------------------------------------------------

async function candles(symbol, interval, range) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, true);
  const r = j.chart.result[0];
  const q = r.indicators.quote[0];
  return {
    meta: r.meta,
    bars: r.timestamp.map((t, i) => ({ ts: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }))
      .filter(b => b.o != null && b.c != null),
  };
}

async function getPrices(now) {
  const [gbp, dxy] = await Promise.all([candles('GBPUSD=X', '15m', '5d'), candles('DX-Y.NYB', '1h', '1mo')]);
  const sydTs = lastLocalHour(now, 7, 'Australia/Sydney');
  const lonTs = lastLocalHour(now, 8, 'Europe/London');
  const at = ts => gbp.bars.find(b => b.ts >= ts) || null;
  const syd = at(sydTs), lon = at(lonTs);

  // Asian session runs from the Sydney open to the London open.
  const asian = gbp.bars.filter(b => b.ts >= sydTs && b.ts < lonTs);
  const aH = asian.length ? Math.max(...asian.map(b => b.h)) : null;
  const aL = asian.length ? Math.min(...asian.map(b => b.l)) : null;
  const sess = gbp.bars.filter(b => b.ts >= sydTs);
  const price = gbp.meta.regularMarketPrice ?? gbp.bars[gbp.bars.length - 1].c;
  const pips = (a, b) => (a == null || b == null ? null : round((a - b) * 10000, 1));

  const dLast = dxy.meta.regularMarketPrice ?? dxy.bars[dxy.bars.length - 1].c;
  const dAt = ms => {
    const prior = dxy.bars.filter(b => b.ts <= now - ms);
    return prior.length ? prior[prior.length - 1].c : dxy.bars[0].c;
  };

  return {
    price: round(price, 5),
    sydneyOpenTs: sydTs, sydneyOpen: round(syd?.o, 5),
    londonOpenTs: lonTs, londonOpen: round(lon?.o, 5),
    asianHigh: round(aH, 5), asianLow: round(aL, 5), asianRangePips: pips(aH, aL),
    dayHigh: round(sess.length ? Math.max(...sess.map(b => b.h)) : null, 5),
    dayLow: round(sess.length ? Math.min(...sess.map(b => b.l)) : null, 5),
    changeFromSydneyPips: pips(price, syd?.o),
    changeFromLondonPips: pips(price, lon?.o),
    asianRangePosition: aH != null && aL != null && aH > aL ? round((price - aL) / (aH - aL), 3) : null,
    dxy: {
      last: round(dLast, 3),
      change24hPct: round(((dLast - dAt(864e5)) / dAt(864e5)) * 100, 3),
      change5dPct: round(((dLast - dAt(4.32e8)) / dAt(4.32e8)) * 100, 3),
    },
  };
}

// --- calendar ---------------------------------------------------------------
// ForexFactory carries the schedule, impact tiers and consensus but publishes no
// `actual`; TradingView carries actuals and doubles as a fallback schedule.

const STOP = new Set(['the', 'of', 'and', 'index', 'rate', 'change', 'mom', 'yoy', 'qoq', 'final', 'prel', 'adv']);
const toks = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
function overlap(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / Math.min(A.size, B.size);
}

function mkEvent(title, cc, ts, impact, forecast, previous, actual) {
  const ind = classify(title, cc);
  return {
    title, country: cc, ts, timeRo: fmt(ts), impact, tier: TIER[impact] || 1,
    forecast, previous, actual,
    forecastRaw: forecast == null ? null : String(forecast),
    previousRaw: previous == null ? null : String(previous),
    released: actual != null,
    indicator: ind ? ind[0] : null, requested: !!ind,
  };
}

async function getCalendar(now) {
  const ff = await get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', true)
    .catch(e => { warnings.push(`ForexFactory indisponibil: ${e.message}`); return []; });

  const from = new Date(now - 5 * 864e5).toISOString();
  const to = new Date(now + 5 * 864e5).toISOString();
  // TradingView returns an HTML error page without a browser-like Origin/Referer.
  const tvRaw = await get(
    `https://economic-calendar.tradingview.com/events?from=${from}&to=${to}&countries=GB,US`, true,
    { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' },
  ).catch(e => { warnings.push(`TradingView (actuals) indisponibil: ${e.message}`); return { result: [] }; });

  const CC = { GB: 'GBP', US: 'USD' };
  const tv = (tvRaw.result || []).map(e => ({
    ts: new Date(e.date).getTime(), country: CC[e.country] || e.country,
    title: e.title, indicator: e.indicator, actual: e.actual,
    forecast: e.forecast, previous: e.previous, importance: e.importance,
  }));

  const used = new Set();
  const match = ev => {
    let best = null, bs = 0;
    for (let i = 0; i < tv.length; i++) {
      if (used.has(i) || tv[i].country !== ev.cc || Math.abs(tv[i].ts - ev.ts) > 5.4e6) continue;
      const s = Math.max(overlap(ev.title, tv[i].title), overlap(ev.title, tv[i].indicator || ''));
      if (s > bs) { bs = s; best = i; }
    }
    if (best !== null && bs >= 0.5) { used.add(best); return tv[best]; }
    return null;
  };

  let events = [], scheduleSource = 'ForexFactory';
  if (ff.length) {
    events = ff.filter(e => ['GBP', 'USD', 'All'].includes(e.country)).map(e => {
      const ts = new Date(e.date).getTime();
      const cc = e.country === 'All' ? 'GBP' : e.country;
      const m = match({ ts, cc, title: e.title });
      return mkEvent(e.title, cc, ts, e.impact,
        parseNum(e.forecast) ?? (m?.forecast != null ? Number(m.forecast) : null),
        parseNum(e.previous) ?? (m?.previous != null ? Number(m.previous) : null),
        m?.actual != null ? Number(m.actual) : null);
    });
  } else if (tv.length) {
    scheduleSource = 'TradingView (fallback)';
    warnings.push('Orarul provine din TradingView, nu din ForexFactory - nivelurile de impact pot diferi.');
    const IMP = { 1: 'High', 0: 'Medium', '-1': 'Low' };
    events = tv.filter(e => {
      const t = e.indicator || e.title || '';
      return !NOISE.test(t) && (e.importance >= 0 || classify(t, e.country));
    }).map(e => mkEvent(e.indicator || e.title, e.country, e.ts, IMP[String(e.importance)] || 'Low',
      e.forecast != null ? Number(e.forecast) : null,
      e.previous != null ? Number(e.previous) : null,
      e.actual != null ? Number(e.actual) : null));
  } else {
    warnings.push('Nicio sursa de calendar disponibila.');
  }

  events.sort((a, b) => a.ts - b.ts);
  const t = dateParts(now, TZ);
  const same = e => { const d = dateParts(e.ts, TZ); return d.y === t.y && d.m === t.m && d.d === t.d; };
  return {
    scheduleSource, all: events,
    upcomingToday: events.filter(e => same(e) && !e.released && e.ts > now),
    releasedToday: events.filter(e => same(e) && e.released),
    recentPrior: events.filter(e => !same(e) && e.released && e.ts < now && e.ts > now - 1.728e8),
  };
}

// --- macro ------------------------------------------------------------------
// All keyless. FRED is deliberately absent: it times out from these networks.

const ONS = {
  cpiYoY: ['economy/inflationandpriceindices/timeseries/d7g7/mm23', 'rate', '%', 'Inflatie CPI a/a'],
  unemployment: ['employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms', 'rate', '%', 'Rata somajului'],
  gdpQoQ: ['economy/grossdomesticproductgdp/timeseries/ihyq/pn2', 'rate', '%', 'PIB t/t'],
  tradeBalance: ['economy/nationalaccounts/balanceofpayments/timeseries/ikbj/mret', 'level', 'GBP m', 'Balanta comerciala'],
  retailSales: ['businessindustryandtrade/retailindustry/timeseries/j5ek/drsi', 'index', '%', 'Retail Sales (volum)'],
  indProd: ['economy/economicoutputandproductivity/output/timeseries/k222/diop', 'index', '%', 'Industrial Production'],
};

async function onsSeries(key) {
  const [path, kind, unit, label] = ONS[key];
  const j = await get(`https://www.ons.gov.uk/${path}/data`, true);
  const src = (j.months && j.months.length ? j.months : j.quarters) || [];
  const pts = src.map(p => ({ date: p.date, value: parseFloat(p.value) })).filter(p => Number.isFinite(p.value));
  if (!pts.length) throw new Error(`ONS ${key}: fara observatii`);
  const last = pts[pts.length - 1], prev = pts[pts.length - 2], ya = pts[pts.length - 13] || pts[pts.length - 5];
  if (kind === 'index') {
    // Published as an index; the market trades the growth rate, so derive it.
    return { label, unit, period: last.date,
      value: prev ? round(((last.value - prev.value) / prev.value) * 100, 2) : null,
      yoy: ya ? round(((last.value - ya.value) / ya.value) * 100, 2) : null };
  }
  return { label, unit, period: last.date, value: round(last.value, 2),
    prev: prev ? round(prev.value, 2) : null, delta: prev ? round(last.value - prev.value, 2) : null };
}

async function boeRate() {
  const csv = await get('https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp'
    + '?csv.x=yes&Datefrom=01/Jan/2024&Dateto=31/Dec/2030&SeriesCodes=IUDBEDR&UsingCodes=Y&CSVF=TT&VPD=Y&VFD=N');
  const rows = csv.trim().split(/\r?\n/).map(l => l.split(',')).filter(r => r.length >= 2 && /^\d/.test(r[0]));
  if (!rows.length) throw new Error('BoE: fara randuri');
  const last = rows[rows.length - 1], level = parseFloat(last[1]);
  let prior = null;
  for (let i = rows.length - 2; i >= 0; i--) {
    const v = parseFloat(rows[i][1]);
    if (v !== level) { prior = v; break; }
  }
  return { label: 'BOE Bank Rate', unit: '%', value: level, asOf: last[0],
    lastMove: prior === null ? null : round(level - prior, 2) };
}

async function fedRate() {
  const j = await get('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json', true);
  const r = j.refRates[0];
  return { label: 'Fed Funds (EFFR)', unit: '%', value: r.percentRate, asOf: r.effectiveDate,
    targetFrom: r.targetRateFrom, targetTo: r.targetRateTo, targetMid: round((r.targetRateFrom + r.targetRateTo) / 2, 3) };
}

async function bls() {
  const ids = ['CES0000000001', 'LNS14000000', 'CUSR0000SA0'];
  const y = new Date().getUTCFullYear();
  const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ seriesid: ids, startyear: String(y - 1), endyear: String(y) }),
  });
  const j = await res.json();
  if (j.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS: ${j.status}`);
  const by = {};
  for (const s of j.Results.series) {
    // M13 is an annual average, not a month.
    by[s.seriesID] = s.data.filter(d => /^M\d\d$/.test(d.period) && d.period !== 'M13')
      .map(d => ({ period: `${d.year} ${d.periodName}`, value: parseFloat(d.value) }));
  }
  const p = by[ids[0]] || [], u = by[ids[1]] || [], c = by[ids[2]] || [];
  const out = {};
  if (p.length >= 2) out.payrolls = { label: 'Nonfarm Payrolls (variatie lunara)', unit: 'K', period: p[0].period, value: round(p[0].value - p[1].value, 0) };
  if (u.length) out.unemployment = { label: 'Rata somajului', unit: '%', period: u[0].period, value: u[0].value, delta: u[1] ? round(u[0].value - u[1].value, 2) : null };
  if (c.length >= 13) out.cpiYoY = { label: 'Inflatie CPI a/a', unit: '%', period: c[0].period, value: round(((c[0].value - c[12].value) / c[12].value) * 100, 2) };
  return out;
}

async function getMacro() {
  const settle = async (name, fn) => { try { return await fn(); } catch (e) { warnings.push(`${name}: ${e.message}`); return null; } };
  const [cpiUk, unUk, gdpUk, trUk, rsUk, ipUk, boe, fed, us] = await Promise.all([
    settle('ONS CPI', () => onsSeries('cpiYoY')),
    settle('ONS somaj', () => onsSeries('unemployment')),
    settle('ONS PIB', () => onsSeries('gdpQoQ')),
    settle('ONS balanta comerciala', () => onsSeries('tradeBalance')),
    settle('ONS retail sales', () => onsSeries('retailSales')),
    settle('ONS industrial production', () => onsSeries('indProd')),
    settle('BoE', boeRate), settle('NY Fed', fedRate), settle('BLS', bls),
  ]);
  const uk = { cpiYoY: cpiUk, unemployment: unUk, gdpQoQ: gdpUk, tradeBalance: trUk, retailSales: rsUk, indProd: ipUk, policyRate: boe };
  const usa = { cpiYoY: us?.cpiYoY || null, unemployment: us?.unemployment || null, payrolls: us?.payrolls || null, policyRate: fed };
  const fedMid = fed ? (fed.targetMid ?? fed.value) : null;
  return {
    uk, us: usa,
    rateDifferential: boe && fed ? round(boe.value - fedMid, 3) : null,
    realDifferential: boe && fed && cpiUk && usa.cpiYoY
      ? round((boe.value - cpiUk.value) - (fedMid - usa.cpiYoY.value), 3) : null,
  };
}

// --- news -------------------------------------------------------------------
// Scored for direction, not general sentiment: tone words are attributed to the
// nearest currency mention, so "hawkish ECB" in a piece that also says GBP is
// not counted as pound-positive.

const FEEDS = [
  ['BabyPips', 'https://www.babypips.com/feed.rss', 1.0],
  ['FXStreet', 'https://www.fxstreet.com/rss/news', 1.0],
  ['Investing.com', 'https://www.investing.com/rss/news_1.rss', 0.9],
  ['Bank of England', 'https://www.bankofengland.co.uk/rss/news', 1.3],
  ['MarketPulse', 'https://www.marketpulse.com/feed/', 0.8],
];

const HAWK = /\b(hawkish|rate hikes?|hikes?|hiking|tighten(ing|s|ed)?|higher for longer|sticky inflation|beat expectations|stronger than expected|upside surprise|robust|resilient)\b/gi;
const DOVE = /\b(dovish|rate cuts?|cuts?|cutting|easing|eases?|stimulus|slowdown|slumps?|contraction|recession|weaker than expected|missed? expectations|downside surprise|disappoint\w*|layoffs?)\b/gi;
const ROFF = /\b(risk-?off|sell-?offs?|plunges?|tumbles?|crash(es)?|flight to safety|haven demand|turmoil|escalat\w+)\b/gi;
const RON = /\b(risk-?on|rall(y|ies)|rebounds?|surges?|climbs?|optimism|relief)\b/gi;
const CUR = {
  GBP: /\b(gbp|sterling|pound|cable|uk|britain|british|boe|bank of england|gilts?)\b/gi,
  USD: /\b(usd|dollar|greenback|dxy|fed|federal reserve|fomc|treasur\w+|powell|u\.s\.|us)\b/gi,
  OTHER: /\b(eur|euro|ecb|lagarde|jpy|yen|boj|aud|aussie|rba|nzd|kiwi|cad|loonie|boc|chf|franc|snb|cny|yuan|bitcoin|btc|crypto|gold|oil)\b/gi,
};

function hits(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) { out.push(m.index); if (m.index === re.lastIndex) re.lastIndex++; }
  return out;
}

function decode(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function scoreNewsItem(title, desc) {
  const text = `${title}. ${desc}`;
  const mentions = [];
  for (const cc of Object.keys(CUR)) for (const i of hits(text, CUR[cc])) mentions.push({ cc, i });
  if (!mentions.length) return null;

  const counts = { GBP: 0, USD: 0, OTHER: 0 };
  for (const m of mentions) counts[m.cc]++;
  if (!counts.GBP && !counts.USD) return null;
  // A piece dominated by a third currency is background noise for cable.
  const rel = (counts.GBP + counts.USD) / (counts.GBP + counts.USD + counts.OTHER);
  if (rel < 0.34) return null;

  const tally = { GBP: 0, USD: 0, OTHER: 0 };
  for (const t of [...hits(text, HAWK).map(i => [i, 1]), ...hits(text, DOVE).map(i => [i, -1])]) {
    let near = null, best = Infinity;
    for (const m of mentions) { const d = Math.abs(m.i - t[0]); if (d < best) { best = d; near = m; } }
    if (near && best <= 140) tally[near.cc] += t[1];
  }

  const drivers = [];
  let score = 0;
  if (tally.GBP) { score += clip(tally.GBP, -2, 2) * 0.25; drivers.push(`GBP ${tally.GBP > 0 ? 'hawkish' : 'dovish'}`); }
  // Hawkish dollar news is bearish for GBP/USD, hence the inverted sign.
  if (tally.USD) { score -= clip(tally.USD, -2, 2) * 0.25; drivers.push(`USD ${tally.USD > 0 ? 'hawkish' : 'dovish'}`); }
  const off = hits(text, ROFF).length, on = hits(text, RON).length;
  // Risk-off bids the dollar as the reserve currency, weighing on cable.
  if (off > on) { score -= 0.15 * clip(off - on, 0, 2); drivers.push('risk-off'); }
  if (on > off) { score += 0.10 * clip(on - off, 0, 2); drivers.push('risk-on'); }
  return { score: round(clip(score * rel, -1, 1), 3), drivers };
}

async function getNews(now) {
  const cutoff = now - 36 * 3600e3;
  const all = [], seen = new Set();
  const results = await Promise.all(FEEDS.map(async ([name, url, weight]) => {
    try { return { name, weight, xml: await get(url) }; }
    catch (e) { warnings.push(`${name}: ${e.message}`); return null; }
  }));

  for (const r of results) {
    if (!r) continue;
    for (const block of r.xml.split(/<item[\s>]/i).slice(1)) {
      const body = block.split(/<\/item>/i)[0];
      const pick = tag => {
        const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
        return m ? decode(m[1]) : '';
      };
      const title = pick('title');
      const ts = Date.parse(pick('pubDate'));
      if (!title || !ts || ts < cutoff) continue;
      const key = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const s = scoreNewsItem(title, pick('description'));
      if (!s) continue;
      const link = body.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      all.push({ source: r.name, weight: r.weight, title, link: link ? decode(link[1]) : '', ts, timeRo: fmt(ts), ...s });
    }
  }

  all.sort((a, b) => b.ts - a.ts);
  // Recent headlines carry more weight; a 36h-old story is nearly spent.
  let wsum = 0, acc = 0;
  for (const i of all) {
    const w = Math.exp(-((now - i.ts) / 3600e3) / 12) * i.weight;
    acc += i.score * w; wsum += w;
  }
  return {
    coverage: all.length,
    sentiment: wsum > 0 ? round(acc / wsum, 3) : 0,
    top: all.filter(i => i.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 6),
  };
}

// --- scoring ----------------------------------------------------------------

function scoreEvents(cal, now) {
  const contributions = [];
  let total = 0, wsum = 0;
  for (const e of [...cal.recentPrior, ...cal.releasedToday]) {
    if (e.actual == null || e.forecast == null) continue;
    const reg = e.indicator ? IND.find(i => i[0] === e.indicator) : null;
    // Outside the registry, the consensus-to-previous gap is a far better
    // volatility proxy than a fraction of the level.
    const scale = reg ? reg[3]
      : (e.previous != null ? Math.max(Math.abs(e.forecast - e.previous) * 1.5, Math.abs(e.forecast) * 0.02, 0.1)
        : Math.max(Math.abs(e.forecast) * 0.05, 0.1));
    const z = clip((e.actual - e.forecast) / scale, -3, 3);
    const iSign = reg ? reg[4] : 1;
    // GBP strength lifts the pair; USD strength weighs on it.
    const pSign = e.country === 'GBP' ? 1 : -1;
    const w = (e.tier || 1) * Math.exp(-Math.max((now - e.ts) / 3600e3, 0) / 20);
    const c = z * iSign * pSign * w;
    total += c; wsum += w;
    contributions.push({ ...e, z: round(z, 2), contribution: round(c, 3),
      direction: c > 0 ? 'GBP/USD ↑' : c < 0 ? 'GBP/USD ↓' : 'neutru' });
  }
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    score: round(wsum > 0 ? clip(total / Math.max(wsum, 1), -3, 3) : 0, 3),
    count: contributions.length,
    highImpactCount: contributions.filter(c => c.impact === 'High').length,
    contributions,
  };
}

function scoreMacro(m) {
  const parts = [];
  const add = v => { if (v != null && !Number.isNaN(v)) parts.push(v); };
  // Rate differential is the dominant persistent driver; 25bp is one unit.
  if (m.rateDifferential != null) add(clip(m.rateDifferential / 0.25, -2, 2));
  // Real rates matter more than nominal for medium-horizon flows.
  if (m.realDifferential != null) add(clip(m.realDifferential / 0.5, -2, 2));
  if (m.uk.gdpQoQ?.value != null) add(clip((m.uk.gdpQoQ.value - 0.3) / 0.3, -1.5, 1.5));
  if (m.uk.unemployment?.delta != null) add(clip(-m.uk.unemployment.delta / 0.2, -1.5, 1.5));
  if (m.us.unemployment?.delta != null) add(clip(m.us.unemployment.delta / 0.2, -1.5, 1.5));
  // Payrolls against roughly the breakeven pace for the US labour force.
  if (m.us.payrolls?.value != null) add(clip(-(m.us.payrolls.value - 125) / 100, -1.5, 1.5));
  if (m.uk.retailSales?.value != null) add(clip(m.uk.retailSales.value / 0.5, -1.2, 1.2));
  if (m.uk.indProd?.value != null) add(clip(m.uk.indProd.value / 0.5, -1.2, 1.2));
  // A widening trade deficit is a structural drag on the pound.
  if (m.uk.tradeBalance?.delta != null) add(clip(m.uk.tradeBalance.delta / 2000, -1, 1));
  // The side with hotter inflation faces more policy tightening.
  if (m.uk.cpiYoY && m.us.cpiYoY) add(clip((m.uk.cpiYoY.value - m.us.cpiYoY.value) / 1.0, -1.2, 1.2));
  return round(parts.length ? clip(parts.reduce((a, b) => a + b, 0) / parts.length * 1.6, -3, 3) : 0, 3);
}

function scoreDxy(p) {
  // DXY moves inversely to GBP/USD.
  const a = p.dxy.change24hPct == null ? 0 : clip(-p.dxy.change24hPct / 0.25, -2, 2);
  const b = p.dxy.change5dPct == null ? 0 : clip(-p.dxy.change5dPct / 0.8, -1.5, 1.5);
  return round(clip(a * 0.65 + b * 0.35, -3, 3), 3);
}

function scoreTechnical(p) {
  let s = 0;
  // 40 pips from the Sydney open is a decisive daily move for cable.
  if (p.changeFromSydneyPips != null) s += clip(p.changeFromSydneyPips / 40, -1.5, 1.5) * 0.4;
  if (p.asianRangePosition != null) {
    // Breaking out of the Asian range is the classic London-session tell.
    const r = p.asianRangePosition;
    s += (r > 1 ? clip(1 + (r - 1) * 2, 1, 2) : r < 0 ? clip(-1 + r * 2, -2, -1) : (r - 0.5) * 1.4) * 0.4;
  }
  if (p.changeFromLondonPips != null) s += clip(p.changeFromLondonPips / 30, -1.5, 1.5) * 0.2;
  return round(clip(s * 1.5, -3, 3), 3);
}

function aggregate(cal, macro, prices, news, now) {
  const ev = scoreEvents(cal, now);
  const ma = scoreMacro(macro);
  const dx = scoreDxy(prices);
  const nwConf = clip(news.coverage / 12, 0, 1);
  // A strong tilt drawn from two headlines is not a strong signal.
  const nw = round(clip(news.sentiment * 2.2 * nwConf, -3, 3), 3);
  const te = scoreTechnical(prices);

  const components = [
    ['Surprize din calendar', ev.score, W.events],
    ['Macro structural', ma, W.macro],
    ['Dolar larg (DXY)', dx, W.dxy],
    ['Flux de stiri', nw, W.news],
    ['Structura sesiunii', te, W.technical],
  ];
  const net = round(components.reduce((s, c) => s + c[1] * c[2], 0), 3);

  const bias = net > 1.5 ? ['BULLISH puternic', 'LONG', '▲▲']
    : net > 0.5 ? ['BULLISH moderat', 'LONG', '▲']
    : net < -1.5 ? ['BEARISH puternic', 'SHORT', '▼▼']
    : net < -0.5 ? ['BEARISH moderat', 'SHORT', '▼']
    : ['NEUTRU / range', 'FLAT', '■'];

  // Fundamental legs versus price-based legs; when they disagree materially the
  // signal is not tradeable regardless of how large the net number looks.
  const fundamental = round(ev.score * 0.55 + ma * 0.3 + nw * 0.15, 3);
  const priceBased = round(dx * 0.55 + te * 0.45, 3);
  const opposed = Math.sign(fundamental) && Math.sign(priceBased) && Math.sign(fundamental) !== Math.sign(priceBased);
  const divergent = !!opposed && Math.abs(fundamental - priceBased) > 1.0;

  let conf = clip(Math.abs(net) / 2.0, 0, 1);
  const caveats = [];
  if (!ev.count) { conf *= 0.6; caveats.push('Niciun indicator cu actual publicat in fereastra analizata - semnalul nu are catalizator de stiri.'); }
  else if (!ev.highImpactCount) { conf *= 0.8; caveats.push('Nicio publicare de impact ridicat - surprizele provin din indicatori secundari.'); }
  if (news.coverage < 6) { conf *= 0.85; caveats.push('Acoperire redusa a fluxului de stiri.'); }
  if (divergent) { conf *= 0.5; caveats.push('Divergenta materiala fundamental vs pret.'); }
  else if (opposed) { conf *= 0.8; caveats.push('Fundamentalul si pretul au semne opuse, dar diferenta este mica - semnal mixt.'); }
  const pending = cal.upcomingToday.filter(e => e.impact === 'High');
  if (pending.length) { conf *= 0.7; caveats.push(`${pending.length} publicare(i) de impact ridicat inca nepublicate azi - risc de eveniment deschis.`); }

  return {
    net, bias: bias[0], dir: bias[1], arrow: bias[2],
    confidence: round(conf, 2),
    confidenceLabel: conf >= 0.66 ? 'RIDICATA' : conf >= 0.33 ? 'MEDIE' : 'SCAZUTA',
    tradeable: Math.abs(net) >= 0.5 && !divergent && conf >= 0.33,
    divergent, opposed: !!opposed, fundamental, priceBased, caveats,
    components, events: ev,
  };
}

function buildPlan(agg, p) {
  const range = p.asianHigh != null && p.asianLow != null ? p.asianHigh - p.asianLow : null;
  const unit = range && range > 0.0005 ? range : 0.0030;
  if (!agg.tradeable) {
    return { action: 'FARA TRADE', rationale: agg.divergent
      ? 'Semnalele fundamentale si cele de pret sunt divergente; se asteapta alinierea lor.'
      : Math.abs(agg.net) < 0.5 ? 'Scor net in zona neutra; nu exista avantaj directional suficient.'
      : 'Increderea este prea scazuta pentru dimensionarea unei pozitii.' };
  }
  const long = agg.dir === 'LONG';
  const entry = p.price;
  // Invalidation sits beyond the session range edge, where the thesis actually fails.
  const stop = round(long ? Math.min(p.asianLow, p.dayLow) - unit * 0.25
    : Math.max(p.asianHigh, p.dayHigh) + unit * 0.25, 5);
  const risk = Math.abs(entry - stop);
  return {
    action: long ? 'BIAS LONG' : 'BIAS SHORT',
    rationale: `Scor net ${agg.net} (${agg.bias}), incredere ${agg.confidenceLabel}. Fundamental ${agg.fundamental} si pret ${agg.priceBased} indica aceeasi directie.`,
    entryZone: [round(long ? entry - unit * 0.2 : entry, 5), round(long ? entry : entry + unit * 0.2, 5)],
    invalidation: stop, riskPips: round(risk * 10000, 1),
    target1: round(long ? entry + risk * 1.5 : entry - risk * 1.5, 5),
    target2: round(long ? entry + risk * 2.5 : entry - risk * 2.5, 5),
  };
}

// --- email rendering --------------------------------------------------------
// Only tags the Outlook connector's sanitizer preserves: headings, paragraphs,
// links, lists, basic formatting, tables and pre. No div, span or inline styles.

function renderEmail(slotLabel, now, p, macro, cal, news, agg, plan) {
  const H = [];
  const td = (...c) => `<tr>${c.map(x => `<td>${x}</td>`).join('')}</tr>`;
  const th = (...c) => `<tr>${c.map(x => `<th align="left">${x}</th>`).join('')}</tr>`;
  const T = '<table border="1" cellpadding="5" cellspacing="0">';

  H.push(`<h2>Raport GBP/USD — ${esc(slotLabel)}</h2>`);
  H.push(`<p><b>${agg.arrow} ${esc(agg.bias)}</b> · scor net <b>${sgn(agg.net, 3)}</b> · încredere <b>${agg.confidenceLabel}</b> (${(agg.confidence * 100).toFixed(0)}%)<br>`);
  H.push(`Preț curent <b>${num(p.price, 5)}</b> · generat ${fmt(now)} ora României</p>`);
  H.push(`<p><b>Concluzie: ${esc(plan.action)}</b><br>${esc(plan.rationale)}</p><hr>`);

  H.push('<h3>1. Snapshot piață</h3>' + T);
  H.push(td('<b>Open sesiune Sydney</b>', `${num(p.sydneyOpen, 5)} (${fmt(p.sydneyOpenTs)})`));
  H.push(td('Variație de la Sydney', `${sgn(p.changeFromSydneyPips, 1)} pips`));
  H.push(td('Open sesiune Londra', `${num(p.londonOpen, 5)} (${fmt(p.londonOpenTs)})`));
  H.push(td('Range asiatic', `${num(p.asianLow, 5)} – ${num(p.asianHigh, 5)} (${num(p.asianRangePips, 1)} pips)`));
  H.push(td('Poziție în range', p.asianRangePosition == null ? '—' : `${(p.asianRangePosition * 100).toFixed(0)}%`));
  H.push(td('Maxim / minim zi', `${num(p.dayHigh, 5)} / ${num(p.dayLow, 5)}`));
  H.push(td('DXY', `${num(p.dxy.last, 3)} (24h ${sgn(p.dxy.change24hPct, 3)}%, 5z ${sgn(p.dxy.change5dPct, 3)}%)`));
  H.push('</table>');

  H.push('<h3>2. Calendar — publicat (fereastră 48h)</h3>');
  if (!agg.events.contributions.length) H.push('<p>Niciun indicator cu valoare publicată în fereastra analizată.</p>');
  else {
    H.push(T + th('Ora', 'Val.', 'Indicator', 'Actual', 'Consens', 'Anterior', 'z', 'Direcție'));
    for (const c of agg.events.contributions) {
      H.push(td(esc(c.timeRo), esc(c.country), esc(c.title) + (c.requested ? ' <b>*</b>' : ''),
        `<b>${num(c.actual, 2)}</b>`, num(c.forecast, 2), num(c.previous, 2), `<b>${sgn(c.z, 2)}</b>`, c.direction));
    }
    H.push('</table><p><i>* = indicator din lista urmărită explicit</i></p>');
  }

  H.push(`<h3>3. Calendar — urmează azi</h3><p><i>Sursă orar: ${esc(cal.scheduleSource)}</i></p>`);
  if (!cal.upcomingToday.length) H.push('<p>Nimic programat pentru restul zilei.</p>');
  else {
    H.push(T + th('Ora', 'Val.', 'Impact', 'Indicator', 'Consens', 'Anterior'));
    for (const e of cal.upcomingToday) {
      H.push(td(esc(e.timeRo), esc(e.country), e.impact === 'High' ? `<b>${e.impact}</b>` : e.impact,
        esc(e.title), esc(e.forecastRaw || '—'), esc(e.previousRaw || '—')));
    }
    H.push('</table>');
  }

  const mr = (label, o, extra) => o
    ? td(label, `<b>${num(o.value, 2)}${o.unit === '%' ? '%' : ' ' + (o.unit || '')}</b> <i>(${esc(o.period || o.asOf || '')})</i>${extra || ''}`)
    : td(label, '<i>indisponibil</i>');
  H.push('<h3>4. Context macro structural</h3>' + T + th('Regatul Unit', 'Valoare'));
  H.push(mr('Bank Rate (BOE)', macro.uk.policyRate, macro.uk.policyRate?.lastMove != null ? ` · ultima mișcare ${sgn(macro.uk.policyRate.lastMove, 2)}pp` : ''));
  H.push(mr('Inflație CPI a/a', macro.uk.cpiYoY));
  H.push(mr('Rata șomajului', macro.uk.unemployment));
  H.push(mr('PIB t/t', macro.uk.gdpQoQ));
  H.push(mr('Retail Sales m/m', macro.uk.retailSales));
  H.push(mr('Industrial Production m/m', macro.uk.indProd));
  H.push(mr('Balanță comercială', macro.uk.tradeBalance));
  H.push('</table>' + T + th('Statele Unite', 'Valoare'));
  H.push(mr('Fed Funds (EFFR)', macro.us.policyRate, macro.us.policyRate ? ` · target ${macro.us.policyRate.targetFrom}–${macro.us.policyRate.targetTo}%` : ''));
  H.push(mr('Inflație CPI a/a', macro.us.cpiYoY));
  H.push(mr('Rata șomajului', macro.us.unemployment));
  H.push(mr('Nonfarm Payrolls', macro.us.payrolls));
  H.push('</table>');
  H.push(`<p><b>Diferențial dobânzi (BOE − Fed): ${sgn(macro.rateDifferential, 3)} pp</b> · diferențial real: <b>${sgn(macro.realDifferential, 3)} pp</b></p>`);

  H.push(`<h3>5. Flux de știri</h3><p>${news.coverage} articole analizate · sentiment net <b>${sgn(news.sentiment, 3)}</b> (pozitiv = favorabil GBP/USD)</p>`);
  if (!news.top.length) H.push('<p>Niciun titlu cu direcție clară pentru GBP/USD.</p>');
  else {
    H.push('<ul>');
    for (const i of news.top) {
      H.push(`<li><b>${sgn(i.score, 2)}</b> — ${i.link ? `<a href="${esc(i.link)}">${esc(i.title)}</a>` : esc(i.title)}`
        + `<br><i>${esc(i.timeRo)} · ${esc(i.source)}${i.drivers.length ? ' · ' + esc(i.drivers.join(', ')) : ''}</i></li>`);
    }
    H.push('</ul>');
  }

  const bars = agg.components.map(c =>
    `${c[0].padEnd(24)} ${sgn(c[1], 2).padStart(6)}  ${((c[2] * 100).toFixed(0) + '%').padStart(4)}  ${(c[1] < 0 ? '-' : '+').repeat(Math.round(Math.min(Math.abs(c[1]), 3) * 6))}`).join('\n');
  H.push(`<h3>6. Scor și trend</h3><pre>${esc(bars)}</pre>`);
  H.push(`<p><b>Scor net ${sgn(agg.net, 3)}</b> — ${agg.arrow} ${esc(agg.bias)}<br>Fundamental ${sgn(agg.fundamental, 2)} · Preț ${sgn(agg.priceBased, 2)} — `
    + `${agg.divergent ? '<b>DIVERGENTE</b>' : agg.opposed ? 'semne opuse, diferență mică' : 'aliniate'}</p>`);

  H.push(`<h3>7. Concluzie — trade posibil imediat</h3><p><b>${esc(plan.action)}</b><br>${esc(plan.rationale)}</p>`);
  if (plan.entryZone) {
    H.push(T + td('<b>Zonă de referință</b>', `${num(plan.entryZone[0], 5)} – ${num(plan.entryZone[1], 5)}`)
      + td('<b>Invalidare</b>', `${num(plan.invalidation, 5)} (${num(plan.riskPips, 1)} pips risc)`)
      + td('<b>Ținte</b>', `${num(plan.target1, 5)} / ${num(plan.target2, 5)} (1:1.5 și 1:2.5)`) + '</table>');
  }
  H.push(`<p>Niveluri de urmărit: Sydney <b>${num(p.sydneyOpen, 5)}</b> · range asiatic <b>${num(p.asianLow, 5)}–${num(p.asianHigh, 5)}</b></p>`);

  if (agg.caveats.length) H.push('<p><b>Rezerve</b></p><ul>' + agg.caveats.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>');
  if (warnings.length) H.push('<p><b>Avertizări surse</b></p><ul>' + warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>');

  H.push('<hr><p><i>Surse: ForexFactory (calendar/consens), TradingView (actuals), ONS, Bank of England, BLS, '
    + 'Federal Reserve Bank of New York, Yahoo Finance, BabyPips, FXStreet, Investing.com.<br>'
    + 'Analiză cantitativă pe date publice. Nu constituie consultanță de investiții.</i></p>');
  return H.join('\n');
}

// --- entry point ------------------------------------------------------------

const SLOTS = {
  '12:00': 'Sesiunea de dimineață (12:00 RO) — după publicările UK',
  '16:00': 'Sesiunea US (16:00 RO) — după publicările US de la 15:30',
  '17:15': 'Completare ISM / Consumer Confidence (17:15 RO)',
};

// With no --slot the label is inferred from the Bucharest clock, so one routine
// can cover more than one firing time.
function inferSlot(now) {
  const h = +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now);
  return h < 13 ? '12:00' : h < 17 ? '16:00' : '17:15';
}

(async () => {
  const args = process.argv.slice(2);
  const si = args.indexOf('--slot');
  const now = Date.now();
  const slot = si >= 0 ? args[si + 1] : inferSlot(now);

  const [pr, cr, mr, nr] = await Promise.allSettled([getPrices(now), getCalendar(now), getMacro(), getNews(now)]);
  if (pr.status !== 'fulfilled') throw new Error(`Fara date de pret nu se poate genera raportul: ${pr.reason?.message}`);
  const prices = pr.value;
  const cal = cr.status === 'fulfilled' ? cr.value
    : (warnings.push(`Calendar: ${cr.reason?.message}`), { scheduleSource: '—', all: [], upcomingToday: [], releasedToday: [], recentPrior: [] });
  const macro = mr.status === 'fulfilled' ? mr.value
    : (warnings.push(`Macro: ${mr.reason?.message}`), { uk: {}, us: {}, rateDifferential: null, realDifferential: null });
  const news = nr.status === 'fulfilled' ? nr.value
    : (warnings.push(`Stiri: ${nr.reason?.message}`), { coverage: 0, sentiment: 0, top: [] });

  const agg = aggregate(cal, macro, prices, news, now);
  const plan = buildPlan(agg, prices);
  const html = renderEmail(SLOTS[slot] || slot, now, prices, macro, cal, news, agg, plan);
  const subject = `GBP/USD ${agg.arrow} ${agg.bias} · scor ${sgn(agg.net, 2)} · ${num(prices.price, 5)} · ${fmt(now)}`;

  // CI wants files, not delimited stdout: --out-dir writes subject.txt and body.html
  // so a mail step can read them directly without parsing.
  const oi = args.indexOf('--out-dir');
  if (oi >= 0) {
    const dir = args[oi + 1] || '.';
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/subject.txt`, subject, 'utf8');
    writeFileSync(`${dir}/body.html`, html, 'utf8');
    console.log(`scris ${dir}/subject.txt`);
    console.log(`scris ${dir}/body.html`);
  } else {
    console.log('=====SUBJECT=====');
    console.log(subject);
    console.log('=====HTML=====');
    console.log(html);
    console.log('=====END=====');
  }
  console.error(`[rezumat] net=${agg.net} | ${agg.bias} | ${plan.action} | surse-avertizate=${warnings.length}`);
})().catch(e => { console.error('EROARE:', e.message); process.exit(1); });
