import http from 'node:http';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { createCacheStore, createPool, deviceStats, migrate, modelStats, startPaywallOnce, updateDaily } from './db.js';
import { modelName } from './models.js';
import { createProviders } from './providers.js';
import { createQuoteCache } from './quotes.js';
import { createDirectory, US_MICS } from './directory.js';
import { freshness } from './market.js';
import { createStripe } from './stripe.js';
import { createFigi } from './figi.js';

const missing = checkConfig(config);
// Datenanbieter aus PROVIDERS (z. B. "alpaca,twelvedata"); je Aufgabe der erste passende
const providers = createProviders(process.env, { markets: config.directoryMarkets });
if (!providers.quotes) {
  missing.push(`Zugangsdaten für einen Kursanbieter (PROVIDERS=${process.env.PROVIDERS || process.env.QUOTE_PROVIDER || 'twelvedata'})`);
}
if (missing.length) {
  console.error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  process.exit(1);
}

const pool = createPool(config);
await migrate(pool);
if (config.paywallEnabled) await startPaywallOnce(pool, config.trialDays);

const store = createCacheStore(pool);
const qp = providers.quotes;
const sp = providers.series;
const dp = providers.directory;

// Fester Takt: Kurse alle QUOTE_CACHE_SECONDS (Standard 60 s), Charts alle SERIES_CACHE_SECONDS.
// Gleiche Symbole vieler Uhren kosten nichts extra (gemeinsamer Cache).
const STALE = 4 * 86400; // alte Werte notfalls bis zu 4 Tage zeigen (Wochenende, Ausfall)
// Kurse, die älter sind als WAIT_STALE Sekunden (niemand hielt sie warm), werden beim Abruf
// frisch geholt; die Uhr wartet dafür höchstens WAIT_MS, sonst bekommt sie den alten Wert
const WAIT_STALE = Math.max(120, config.quoteCacheSeconds * 2);
const WAIT_MS = 3000;
const batch = (p) => p.maxBatch || (p.budget?.perMinute > 0 ? Math.min(config.batchSize, p.budget.perMinute) : 50);

const quotes = createQuoteCache({
  provider: qp, store, kind: 'quote', cacheSeconds: config.quoteCacheSeconds, maxBatch: batch(qp),
  staleSeconds: STALE,
  // Anbieter mit Vor-/Nachbörse werden auch 4:00–20:00 New Yorker Zeit aufgefrischt
  isFresh: freshness(() => config.quoteCacheSeconds, { extended: Boolean(qp.extendedHours) }),
  // App nach einer Pause geöffnet: nicht den alten Kurs zeigen, sondern kurz auf den neuen warten
  waitStaleSeconds: WAIT_STALE, waitMs: WAIT_MS,
});
// Kursverlauf für die Mini-Charts: seltener
const series = sp
  ? createQuoteCache({
    provider: sp, store, kind: 'series', method: 'fetchSeries',
    cacheSeconds: config.seriesCacheSeconds, maxBatch: batch(sp),
    staleSeconds: STALE, missSeconds: 300,
    isFresh: freshness(() => config.seriesCacheSeconds),
    waitStaleSeconds: config.seriesCacheSeconds * 2, waitMs: WAIT_MS,
  })
  : null;

const describe = (p) => {
  if (!p) return '–';
  const b = p.budget?.stats();
  return b ? `${p.name} ${b.day}/${b.perDay || '∞'} heute` : p.name;
};
// Nutzung (nur Summen) ins Log: beim Start und alle 30 Minuten; schreibt auch den Tagesverlauf fort
async function logUsage() {
  try {
    const d = await deviceStats(pool);
    await updateDaily(pool, 1);
    console.log(`Uhren: ${d.total} registriert, davon echt ${d.real} (Entwickler/Simulator ${d.dev}, Test ${d.test}) | `
      + `echt aktiv 1 h: ${d.active_1h}, 24 h: ${d.active_1d}, 7 Tage: ${d.active_7d}, 30 Tage: ${d.active_30d} | `
      + `neu 24 h: ${d.new_1d}, 7 Tage: ${d.new_7d} | mit Web-Watchlist: ${d.with_watchlist}, ohne Modell (App < 1.5): ${d.unknown}`);
    const models = await modelStats(pool);
    if (models.length) console.log(`Modelle (echt, aktiv 7 Tage): ${models.map((r) => `${modelName(r.part_number)} ${r.n}`).join(', ')}`);
  } catch (err) {
    console.warn('Nutzungsstatistik:', err.message);
  }
}
logUsage();
setInterval(logUsage, 30 * 60 * 1000).unref();

setInterval(() => {
  const used = new Set([qp, sp, dp].filter(Boolean));
  console.log(`Credits: ${[...used].map(describe).join(' · ')}, Symbole ${quotes.stats().watched}`);
}, 30 * 60 * 1000).unref();

// Suche: US-Börsen + die Börsen der konfigurierten Anbieter (z. B. EODHD: Xetra, Wien …)
const usOnly = config.directoryMarkets !== 'all';
const allowed = new Set([...US_MICS, ...(dp?.mics || [])]);
const directory = createDirectory({
  loader: () => dp?.loadDirectory?.() ?? [],
  store,
  storeKey: usOnly ? `v3-${[...allowed].sort().join(',')}` : 'all-v3',
  filter: usOnly ? (r) => allowed.has(r.mic) : (r) => !/^(OTC|PINX|PSGM|EXPM)/.test(r.mic || ''),
});

const loaded = await quotes.load() + (series ? await series.load() : 0);
console.log(`Cache aus Postgres: ${loaded} Einträge – Kurse älter als ${WAIT_STALE} s werden beim Abruf frisch geholt (max. ${WAIT_MS} ms Wartezeit)`);
quotes.start(15);        // Vorwärmer: prüft alle 15 s, holt, was älter als QUOTE_CACHE_SECONDS ist
series?.start(60);
directory.init();

const stripe = config.paywallEnabled ? createStripe(config) : null;

// Deutsche Handelsplätze (L&S, Tradegate) für die Suche + Kürzel über OpenFIGI
const eu = {
  lsx: providers.all.find((p) => p.id === 'lsx') || null,
  tradegate: providers.all.find((p) => p.id === 'tradegate') || null,
  figi: createFigi({ store, apiKey: process.env.OPENFIGI_API_KEY || '' }),
};

const handler = createApp({ cfg: config, pool, quotes, series, directory, eu, stripe });
const server = http.createServer(handler);
console.log(`Statistik-Dashboard: ${config.publicUrl}/stats?k=${handler.statsKey}`);
server.listen(config.port, () => {
  console.log(`${config.appName}-Backend läuft auf Port ${config.port} – Kurse: ${qp.name}${qp.extendedHours ? ' (inkl. Vor-/Nachbörse)' : ''}, Charts: ${sp?.name || '–'}, Suche: ${dp?.name || '–'}, ${config.paywallEnabled ? 'Abo aktiv' : 'kostenlos'}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
