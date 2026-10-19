import http from 'node:http';
import { createApp } from './app.js';
import { checkConfig, config } from './config.js';
import { createPool, migrate, startPaywallOnce } from './db.js';
import { createProvider } from './providers.js';
import { createQuoteCache } from './quotes.js';
import { createStripe } from './stripe.js';

const missing = checkConfig(config);
if (missing.length) {
  console.error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  process.exit(1);
}

const pool = createPool(config);
await migrate(pool);
if (config.paywallEnabled) await startPaywallOnce(pool, config.trialDays);

const quotes = createQuoteCache({
  provider: createProvider(config),
  cacheSeconds: config.quoteCacheSeconds,
});
const stripe = config.paywallEnabled ? createStripe(config) : null;

const server = http.createServer(createApp({ cfg: config, pool, quotes, stripe }));
server.listen(config.port, () => {
  console.log(`${config.appName}-Backend läuft auf Port ${config.port} (Kurse: ${quotes.source}, ${config.paywallEnabled ? 'Abo aktiv' : 'kostenlos'})`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
