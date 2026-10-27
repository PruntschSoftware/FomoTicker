import http from 'node:http';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { createCacheStore, createPool, deviceStats, migrate, modelStats, startPaywallOnce } from './db.js';
import { modelName } from './models.js';
import { createProviders } from './providers.js';
import { createQuoteCache } from './quotes.js';
import { createDirectory, US_MICS } from './directory.js';
import { freshness } from './market.js';
import { createStripe } from './stripe.js';

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
const batch = (p) => p.maxBatch || (p.budget?.perMinute > 0 ? Math.min(config.batchSize, p.budget.perMinute) : 50);

const quotes = createQuoteCache({
  provider: qp, store, kind: 'quote', cacheSeconds: config.quoteCacheSeconds, maxBatch: batch(qp),
  staleSeconds: STALE,
  // Anbieter mit Vor-/Nachbörse werden auch 4:00–20:00 New Yorker Zeit aufgefrischt
  isFresh: freshness(() => config.quoteCacheSeconds, { extended: Boolean(qp.extendedHours) }),
});
// Kursverlauf für die Mini-Charts: seltener
const series = sp
  ? createQuoteCache({
    provider: sp, store, kind: 'series', method: 'fetchSeries',
    cacheSeconds: config.seriesCacheSeconds, maxBatch: batch(sp),
    staleSeconds: STALE, missSeconds: 300,
    isFresh: freshness(() => config.seriesCacheSeconds),
  })
  : null;

const describe = (p) => {
  if (!p) return '–';
  const b = p.budget?.stats();
  return b ? `${p.name} ${b.day}/${b.perDay || '∞'} heute` : p.name;
};
// Nutzung (nur Summen) ins Log: beim Start und alle 30 Minuten
async function logUsage() {
  try {
    const d = await deviceStats(pool);
    console.log(`Uhren: ${d.total} registriert, davon echt ${d.real}, Entwickler/Simulator ${d.dev}, Test ${d.test}, `
      + `ohne Modell (App < 1.5) ${d.unknown} | aktiv 24 h: ${d.active_1d}, aktiv 7 Tage: ${d.active_7d}, `
      + `nie Kurse geladen: ${d.never_loaded}, mit Web-Watchlist: ${d.with_watchlist}, neu in 7 Tagen: ${d.new_7d}`);
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
console.log(`Cache aus Postgres: ${loaded} Einträge`);
quotes.start(15);        // Vorwärmer: prüft alle 15 s, holt, was älter als QUOTE_CACHE_SECONDS ist
series?.start(60);
directory.init();

const stripe = config.paywallEnabled ? createStripe(config) : null;

const server = http.createServer(createApp({ cfg: config, pool, quotes, series, directory, stripe }));
server.listen(config.port, () => {
  console.log(`${config.appName}-Backend läuft auf Port ${config.port} – Kurse: ${qp.name}${qp.extendedHours ? ' (inkl. Vor-/Nachbörse)' : ''}, Charts: ${sp?.name || '–'}, Suche: ${dp?.name || '–'}, ${config.paywallEnabled ? 'Abo aktiv' : 'kostenlos'}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
