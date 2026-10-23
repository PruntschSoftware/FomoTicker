// Datenanbieter – Registry und Zusammenstellung
//
// Neuen Anbieter anbinden:
//   1. Datei providers/<name>.js mit einer Fabrik create<Name>({ env, budget, markets })
//      anlegen, die ein Objekt nach dem Vertrag unten liefert
//   2. hier in REGISTRY eintragen (Standard-Limits + Fabrik)
//   3. in Railway PROVIDERS=<name>,... setzen (Reihenfolge = Priorität)
//
// Vertrag eines Anbieters (alles außer id/name ist optional):
//   id, name                Kennung und Anzeigename ("Alpaca (IEX)")
//   configured              false, wenn z. B. der API-Schlüssel fehlt -> wird übersprungen
//   extendedHours           true, wenn Vor-/Nachbörse geliefert wird
//   fetchQuotes(keys)    -> { KEY: [kurs, änderung, änderung%, open, high, low, vortag,
//                                   name, extKurs, ext%, "pre"|"post"|""] }
//   fetchSeries(keys)    -> { KEY: [schlusskurse aufsteigend …] }   (Mini-Chart, Tagesverlauf)
//   loadDirectory()      -> [{ symbol, name, exchange, mic, country, type }]   (Suche)
//
// Für jede Aufgabe (Kurse, Charts, Suche) wird der erste konfigurierte Anbieter aus
// PROVIDERS genommen, der sie kann. Einzeln überschreibbar mit QUOTES_PROVIDER,
// SERIES_PROVIDER, DIRECTORY_PROVIDER. Jeder Anbieter hat sein eigenes Credit-Budget.
// Das alte QUOTE_PROVIDER gilt nur noch, wenn PROVIDERS fehlt.

import { createBudget } from './quotes.js';
import { createAlpaca } from './alpaca.js';
import { createFinnhub } from './finnhub.js';
import { createMock } from './mock.js';
import { createTwelveData } from './twelvedata.js';

const num = (v, d) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : d;
};

export const REGISTRY = {
  // Twelve Data Basic: 8 Credits/Minute, 800/Tag, 1 Credit pro Symbol, nur US
  twelvedata: {
    limits: { perMinute: 8, perDay: 800 },
    legacyEnv: { perMinute: 'CREDITS_PER_MINUTE', perDay: 'CREDITS_PER_DAY' },
    create: ({ env, budget, markets }) => createTwelveData({
      apiKey: env.TWELVEDATA_API_KEY,
      baseUrl: env.TWELVEDATA_BASE_URL || 'https://api.twelvedata.com',
      budget,
      markets,
    }),
  },
  // Alpaca Basic (gratis): 200 Anfragen/Minute, kein Tageslimit, IEX-Kurse inkl. Vor-/Nachbörse,
  // alle Symbole in einer Anfrage
  alpaca: {
    limits: { perMinute: 190, perDay: 0 },
    create: ({ env, budget }) => createAlpaca({
      keyId: env.ALPACA_KEY_ID,
      secretKey: env.ALPACA_SECRET_KEY,
      dataUrl: env.ALPACA_DATA_URL || 'https://data.alpaca.markets',
      tradingUrl: env.ALPACA_TRADING_URL || 'https://paper-api.alpaca.markets',
      feed: env.ALPACA_FEED || 'iex',
      budget,
    }),
  },
  // Finnhub Free: 60 Anfragen/Minute, 1 Anfrage pro Symbol, nur Kurse + Suche (keine Charts)
  finnhub: {
    limits: { perMinute: 55, perDay: 0 },
    create: ({ env, budget }) => createFinnhub({
      apiKey: env.FINNHUB_API_KEY,
      baseUrl: env.FINNHUB_BASE_URL || 'https://finnhub.io/api/v1',
      budget,
    }),
  },
  // Spieldaten für Tests
  mock: {
    limits: { perMinute: 0, perDay: 0 },
    create: () => createMock(),
  },
};

/** Budget eines Anbieters: Standard-Limits, per ENV überschreibbar (<ID>_PER_MINUTE / _PER_DAY). */
function budgetFor(id, def, env) {
  const up = id.toUpperCase();
  const pick = (key) => {
    const own = env[`${up}_${key === 'perMinute' ? 'PER_MINUTE' : 'PER_DAY'}`];
    const legacy = def.legacyEnv?.[key] ? env[def.legacyEnv[key]] : undefined;
    return num(own, num(legacy, def.limits[key]));
  };
  return createBudget({ perMinute: pick('perMinute'), perDay: pick('perDay') });
}

/** Liste der gewünschten Anbieter aus der Umgebung (PROVIDERS, sonst altes QUOTE_PROVIDER). */
export function providerList(env) {
  const raw = env.PROVIDERS || env.QUOTE_PROVIDER || 'twelvedata';
  return [...new Set(String(raw).toLowerCase().split(/[\s,;]+/).filter(Boolean))];
}

/**
 * Baut alle gewünschten Anbieter und wählt je Aufgabe einen aus.
 * -> { quotes, series, directory, all: [...], warnings: [...] }
 */
export function createProviders(env, { markets = 'us', log = console } = {}) {
  const wanted = providerList(env);
  const all = [];
  const warnings = [];
  for (const id of wanted) {
    const def = REGISTRY[id];
    if (!def) {
      warnings.push(`Unbekannter Anbieter "${id}" – verfügbar: ${Object.keys(REGISTRY).join(', ')}`);
      continue;
    }
    const budget = budgetFor(id, def, env);
    const p = def.create({ env, budget, markets });
    p.id = id;
    p.budget = budget;
    if (p.configured === false) {
      warnings.push(`Anbieter "${id}" übersprungen: Zugangsdaten fehlen`);
      continue;
    }
    all.push(p);
  }

  const pick = (method, overrideVar) => {
    const forced = env[overrideVar] && String(env[overrideVar]).toLowerCase();
    if (forced) {
      const p = all.find((x) => x.id === forced);
      if (p && typeof p[method] === 'function') return p;
      warnings.push(`${overrideVar}=${forced} kann "${method}" nicht – nehme den nächsten passenden`);
    }
    return all.find((x) => typeof x[method] === 'function') || null;
  };

  const chosen = {
    quotes: pick('fetchQuotes', 'QUOTES_PROVIDER'),
    series: pick('fetchSeries', 'SERIES_PROVIDER'),
    directory: pick('loadDirectory', 'DIRECTORY_PROVIDER'),
    all,
    warnings,
  };
  for (const w of warnings) log.warn?.(w);
  return chosen;
}

// Kompatibilität: früherer Einzel-Anbieter (Tests)
export function createProvider(cfg, { budget = null } = {}) {
  const def = REGISTRY[cfg.quoteProvider];
  if (!def) throw new Error(`Unbekannter QUOTE_PROVIDER: ${cfg.quoteProvider}`);
  if (cfg.quoteProvider === 'twelvedata') {
    return createTwelveData({ ...cfg.twelveData, budget, markets: cfg.directoryMarkets });
  }
  return def.create({ env: process.env, budget, markets: cfg.directoryMarkets });
}
