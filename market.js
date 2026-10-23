// Handelszeiten und Abruf-Takt
//
// Twelve Data Basic: 800 Credits pro Tag. Deshalb
//  - wird außerhalb der US-Handelszeit (Abend, Wochenende) nichts nachgeladen –
//    der letzte Kurs nach Handelsschluss bleibt gültig, bis wieder gehandelt wird
//  - richtet sich der Takt nach der Zahl verschiedener Symbole, damit das
//    Tages-Budget über den ganzen Handelstag reicht

const NY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function nyParts(ms) {
  const parts = Object.fromEntries(NY.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun', min: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * US-Handelsphase: "pre" 4:00–9:30, "regular" 9:30–16:00, "post" 16:00–20:00 (New Yorker Zeit),
 * sonst "closed". Feiertage werden nicht berücksichtigt.
 */
export function usSession(ms = Date.now()) {
  const { weekend, min } = nyParts(ms);
  if (weekend) return 'closed';
  if (min >= 4 * 60 && min < 9 * 60 + 30) return 'pre';
  if (min >= 9 * 60 + 30 && min < 16 * 60) return 'regular';
  if (min >= 16 * 60 && min < 20 * 60) return 'post';
  return 'closed';
}

/** Kalendertag (YYYY-MM-DD) in New York. */
const NY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function nyDay(ms) {
  return NY_DAY.format(new Date(ms));
}

/** Minute des Tages (0..1439) in New York. */
export function nyMinute(ms) {
  return nyParts(ms).min;
}

/** NYSE/NASDAQ regulär Mo–Fr 9:30–16:00 New Yorker Zeit (+5 min Puffer für Schlusskurse). */
export function usMarketOpen(ms = Date.now()) {
  const parts = Object.fromEntries(NY.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  return min >= 9 * 60 + 30 && min < 16 * 60 + 5;
}

// Börsen außerhalb der USA (nur mit größerem Plan): grob 8:00–17:40 MEZ-Raum
const EU = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function otherMarketOpen(ms = Date.now()) {
  const parts = Object.fromEntries(EU.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  return min >= 8 * 60 && min < 17 * 60 + 45;
}

export const marketOpen = (key, ms) => (String(key).includes('@') ? otherMarketOpen(ms) : usMarketOpen(ms));

/** Wie marketOpen, aber für US inkl. Vor-/Nachbörse 4:00–20:05 (für Anbieter mit extendedHours). */
export function marketOpenExtended(key, ms) {
  if (String(key).includes('@')) return otherMarketOpen(ms);
  const { weekend, min } = nyParts(ms);
  return !weekend && min >= 4 * 60 && min < 20 * 60 + 5;
}

const TRADING_SECONDS = 6.5 * 3600 + 300;

/**
 * Takt in Sekunden, so dass `symbols` verschiedene Werte (Kurs + Chart alle
 * seriesFactor Takte) mit `dailyCredits` über einen Handelstag kommen.
 */
export function adaptiveSeconds({ symbols, dailyCredits, minSeconds, seriesFactor = 4 }) {
  if (!(dailyCredits > 0) || !Number.isFinite(dailyCredits)) return minSeconds;
  const n = Math.max(1, symbols);
  const need = (n * TRADING_SECONDS * (1 + 1 / seriesFactor)) / dailyCredits;
  return Math.max(minSeconds, Math.ceil(need / 30) * 30);
}

/**
 * Frisch-Regel für den Cache: geschlossener Markt + nach Handelsschluss geholt
 * = gültig bis zur nächsten Eröffnung (max. 4 Tage). Sonst Takt aus period().
 */
export function freshness(period, { extended = false } = {}) {
  const open = extended ? marketOpenExtended : marketOpen;
  return (key, at, now) => {
    if (!open(key, now) && !open(key, at) && now - at < 4 * 86400 * 1000) return true;
    return now - at < period() * 1000;
  };
}
