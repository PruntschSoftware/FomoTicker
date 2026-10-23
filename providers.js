import { createMock } from './mock.js';
import { createTwelveData } from './twelvedata.js';

/**
 * Ein Provider liefert { name, fetchQuotes(symbols) -> { SYMBOL: [kurs, änderung,
 * änderung%, open, high, low, vortag] } }. Neue Anbieter einfach hier ergänzen.
 */
export function createProvider(cfg, { budget = null } = {}) {
  switch (cfg.quoteProvider) {
    case 'twelvedata':
      return createTwelveData({ ...cfg.twelveData, budget });
    case 'mock':
      return createMock();
    default:
      throw new Error(`Unbekannter QUOTE_PROVIDER: ${cfg.quoteProvider}`);
  }
}
