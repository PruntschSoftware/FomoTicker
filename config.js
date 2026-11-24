const env = process.env;

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const port = num(env.PORT, 3000);

// Nur https-Links ohne Leer-/Sonderzeichen zulassen (landen als href auf der Watchlist-Seite)
function httpsUrl(value) {
  const v = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '';
}

export const config = {
  port,
  databaseUrl: env.DATABASE_URL,
  databaseSsl: bool(env.DATABASE_SSL),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  // Kurze Adresse für die Uhr (z. B. eigene Domain "ticker.deinname.at")
  displayUrl: env.DISPLAY_URL,

  appName: env.APP_NAME || 'StockTicker',
  // false = App kostenlos (Start-Phase), true = Testzeit + Stripe-Abo
  paywallEnabled: bool(env.PAYWALL_ENABLED, false),
  priceLabel: env.PRICE_LABEL || '1 € / Monat',
  trialDays: num(env.TRIAL_DAYS, 7),
  maxSymbols: num(env.MAX_SYMBOLS, 10),
  // Schlüssel fürs Statistik-Dashboard (/stats?k=…); leer = aus DATABASE_URL abgeleitet
  statsKey: env.STATS_KEY || '',

  quoteProvider: env.QUOTE_PROVIDER || 'twelvedata',
  quoteCacheSeconds: num(env.QUOTE_CACHE_SECONDS, 60),
  seriesCacheSeconds: num(env.SERIES_CACHE_SECONDS, 900),
  // Credits pro Minute beim Datenanbieter (Twelve Data Basic: 8), 0 = unbegrenzt
  creditsPerMinute: num(env.CREDITS_PER_MINUTE, 8),
  // Credits pro Tag (Twelve Data Basic: 800), 0 = unbegrenzt
  creditsPerDay: num(env.CREDITS_PER_DAY, 800),
  // Börsen für die Suche: "us" (Basic-Plan) oder "all" (ab Grow-Plan)
  directoryMarkets: env.DIRECTORY_MARKETS || 'us',
  // Symbole pro Sammelabruf
  batchSize: num(env.BATCH_SIZE, 8),
  twelveData: {
    apiKey: env.TWELVEDATA_API_KEY,
    baseUrl: env.TWELVEDATA_BASE_URL || 'https://api.twelvedata.com',
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceId: env.STRIPE_PRICE_ID,
    apiBase: env.STRIPE_API_BASE || 'https://api.stripe.com',
    portalUrl: env.STRIPE_PORTAL_URL,
    automaticTax: bool(env.STRIPE_AUTOMATIC_TAX),
    requireTerms: bool(env.STRIPE_REQUIRE_TERMS),
  },

  // Eigene Social-Kanäle auf der Watchlist-Seite bewerben. Name und Links kommen ausschließlich aus der
  // Umgebung (Railway-Variablen), nicht aus dem Repo. Ohne SOCIAL_NAME oder ohne Link bleibt der Block aus.
  social: {
    name: String(env.SOCIAL_NAME || '').trim().slice(0, 40),
    links: {
      tiktok: httpsUrl(env.SOCIAL_TIKTOK_URL),
      instagram: httpsUrl(env.SOCIAL_INSTAGRAM_URL),
      youtube: httpsUrl(env.SOCIAL_YOUTUBE_URL),
    },
  },

  legal: {
    imprintUrl: env.IMPRINT_URL,
    privacyUrl: env.PRIVACY_URL,
    termsUrl: env.TERMS_URL,
  },
};

export function checkConfig(cfg = config) {
  const missing = [];
  if (!cfg.databaseUrl) missing.push('DATABASE_URL');
  if (cfg.paywallEnabled) {
    if (!cfg.stripe.secretKey) missing.push('STRIPE_SECRET_KEY');
    if (!cfg.stripe.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    if (!cfg.stripe.priceId) missing.push('STRIPE_PRICE_ID');
  }
  return missing;
}
