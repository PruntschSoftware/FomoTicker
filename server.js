import http from 'node:http';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { createCacheStore, createPool, migrate, startPaywallOnce } from './db.js';
import { createProvider } from './providers.js';
import { createBudget, createQuoteCache } from './quotes.js';
import { createDirectory } from './directory.js';
import { adaptiveSeconds, freshness } from './market.js';
import { createStripe } from './stripe.js';

const missing = checkConfig(config);
if (missing.length) {
  console.error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  process.exit(1);
}

const pool = createPool(config);
await migrate(pool);
if (config.paywallEnabled) await startPaywallOnce(pool, config.trialDays);

const store = createCacheStore(pool);
// Ein gemeinsames Credit-Budget für alle Abrufe beim Datenanbieter
const budget = createBudget({ perMinute: config.creditsPerMinute, perDay: config.creditsPerDay });
const provider = createProvider(config, { budget });

// Takt passt sich an: mehr verschiedene Symbole -> seltener, damit das Tages-Budget reicht.
// Gleiche Symbole vieler Uhren kosten nichts extra (gemeinsamer Cache).
let quotes;
const SERIES_FACTOR = Math.max(1, Math.round(config.seriesCacheSeconds / config.quoteCacheSeconds));
const quotePeriod = () => adaptiveSeconds({
  symbols: quotes?.stats().watched || 1,
  dailyCredits: config.creditsPerDay > 0 ? config.creditsPerDay - 60 : Infinity,
  minSeconds: config.quoteCacheSeconds,
  seriesFactor: SERIES_FACTOR,
});
const STALE = 4 * 86400; // alte Werte notfalls bis zu 4 Tage zeigen (Wochenende, Ausfall)

quotes = createQuoteCache({
  provider, store, kind: 'quote', cacheSeconds: config.quoteCacheSeconds, maxBatch: config.batchSize,
  staleSeconds: STALE, isFresh: freshness(quotePeriod),
});
// Kursverlauf für die Mini-Charts: seltener, niedrigere Priorität beim Budget
const series = provider.fetchSeries
  ? createQuoteCache({
    provider, store, kind: 'series', method: 'fetchSeries',
    cacheSeconds: config.seriesCacheSeconds, maxBatch: config.batchSize,
    staleSeconds: STALE, missSeconds: 300,
    isFresh: freshness(() => Math.max(config.seriesCacheSeconds, quotePeriod() * SERIES_FACTOR)),
  })
  : null;
setInterval(() => {
  const b = budget.stats();
  console.log(`Credits heute ${b.day}/${b.perDay || '∞'}, Takt ${quotePeriod()} s, Symbole ${quotes.stats().watched}`);
}, 30 * 60 * 1000).unref();
const directory = createDirectory({ loader: () => provider.loadDirectory?.() ?? [], store });

const loaded = await quotes.load() + (series ? await series.load() : 0);
console.log(`Cache aus Postgres: ${loaded} Einträge`);
quotes.start(30);        // Vorwärmer: prüft alle 30 s, holt nur, was laut Takt fällig ist
series?.start(60);
directory.init();

const stripe = config.paywallEnabled ? createStripe(config) : null;

const server = http.createServer(createApp({ cfg: config, pool, quotes, series, directory, stripe }));
server.listen(config.port, () => {
  console.log(`${config.appName}-Backend läuft auf Port ${config.port} (Kurse: ${quotes.source}, ${config.paywallEnabled ? 'Abo aktiv' : 'kostenlos'})`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
