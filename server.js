import http from 'node:http';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { createCacheStore, createPool, migrate, startPaywallOnce } from './db.js';
import { createProvider } from './providers.js';
import { createBudget, createQuoteCache } from './quotes.js';
import { createDirectory } from './directory.js';
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
const budget = createBudget({ perMinute: config.creditsPerMinute });
const provider = createProvider(config, { budget });

const quotes = createQuoteCache({
  provider, store, kind: 'quote', cacheSeconds: config.quoteCacheSeconds, maxBatch: config.batchSize,
});
// Kursverlauf für die Mini-Charts: länger gültig, niedrigere Priorität beim Budget
const series = provider.fetchSeries
  ? createQuoteCache({
    provider, store, kind: 'series', method: 'fetchSeries',
    cacheSeconds: config.seriesCacheSeconds, maxBatch: config.batchSize,
  })
  : null;
const directory = createDirectory({ loader: () => provider.loadDirectory?.() ?? [], store });

const loaded = await quotes.load() + (series ? await series.load() : 0);
console.log(`Cache aus Postgres: ${loaded} Einträge`);
quotes.start();          // Vorwärmer: gefragte Kurse jede Minute gesammelt auffrischen
series?.start();
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
