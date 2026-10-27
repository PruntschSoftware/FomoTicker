import { createHash, randomBytes, randomInt } from 'node:crypto';
import pg from 'pg';

export function createPool(cfg) {
  return new pg.Pool({
    connectionString: cfg.databaseUrl,
    ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id                     BIGSERIAL PRIMARY KEY,
      token_hash             TEXT NOT NULL UNIQUE,
      pair_code              TEXT NOT NULL UNIQUE,
      device_uid             TEXT UNIQUE,
      trial_ends_at          TIMESTAMPTZ NOT NULL,
      stripe_customer_id     TEXT,
      stripe_subscription_id TEXT UNIQUE,
      subscription_status    TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at           TIMESTAMPTZ
    )
  `);
  // Watchlist von der Webseite: [{ k: "SAP@XETR", s: "SAP", n: "SAP SE", x: "XETRA" }, ...]
  await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS watchlist JSONB`);
  // Uhrmodell (Garmin-Teilenummer) und Entwickler-Build (Simulator/VS Code) – nur für die Statistik
  await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS part_number TEXT`);
  await pool.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS dev BOOLEAN`);
  // Kurs-/Chart-/Verzeichnis-Cache, übersteht Deploys
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_cache (
      kind TEXT NOT NULL,
      key  TEXT NOT NULL,
      at   TIMESTAMPTZ NOT NULL,
      data JSONB NOT NULL,
      PRIMARY KEY (kind, key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

/**
 * Einmalig beim ersten Start mit Paywall: Alle bisherigen Gratis-Nutzer bekommen
 * ab jetzt eine volle Testzeit, statt sofort vor der Paywall zu stehen.
 * Spätere Neustarts ändern nichts mehr (Merker in app_state).
 */
export async function startPaywallOnce(pool, trialDays) {
  await pool.query(
    `WITH flag AS (
       INSERT INTO app_state (key, value) VALUES ('paywall_started_at', now()::text)
       ON CONFLICT (key) DO NOTHING
       RETURNING key
     )
     UPDATE devices
        SET trial_ends_at = GREATEST(trial_ends_at, now() + $1::int * interval '24 hours')
      WHERE EXISTS (SELECT 1 FROM flag) AND stripe_subscription_id IS NULL`,
    [trialDays],
  );
}

// Ohne 0/O/1/I, damit der Code auf der Uhr eindeutig lesbar ist
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newPairCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

const PAID = `COALESCE(subscription_status, '') IN ('active', 'trialing', 'past_due')`;

// Alles, was die API über ein Gerät wissen muss – Zeitlogik bleibt in der DB
const DEVICE_COLS = `
  id,
  part_number,
  dev,
  pair_code,
  stripe_customer_id,
  subscription_status,
  (${PAID}) AS subscribed,
  (${PAID} OR trial_ends_at > now()) AS entitled,
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (trial_ends_at - now())) / 86400))::int AS trial_days_left
`;

/**
 * Registriert ein Gerät oder gibt einem bekannten Gerät (gleiche device_uid)
 * einen neuen Token. Testzeitraum und Kopplungscode bleiben dabei erhalten.
 */
export async function registerDevice(pool, { uid, trialDays }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomBytes(32).toString('base64url');
    try {
      const { rows } = await pool.query(
        `INSERT INTO devices (token_hash, pair_code, device_uid, trial_ends_at)
         VALUES ($1, $2, $3, now() + $4::int * interval '24 hours')
         ON CONFLICT (device_uid) DO UPDATE SET token_hash = EXCLUDED.token_hash
         RETURNING ${DEVICE_COLS}`,
        [hashToken(token), newPairCode(), uid || null, trialDays],
      );
      return { token, device: rows[0] };
    } catch (err) {
      // Kollision beim Kopplungscode -> neuer Versuch
      if (err.code === '23505' && String(err.constraint || err.message).includes('pair_code')) continue;
      throw err;
    }
  }
  throw new Error('Konnte keinen freien Kopplungscode erzeugen');
}

export async function findDeviceByToken(pool, token) {
  const { rows } = await pool.query(
    `UPDATE devices SET last_seen_at = now() WHERE token_hash = $1 RETURNING ${DEVICE_COLS}`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

export async function findDeviceByCode(pool, code) {
  const { rows } = await pool.query(
    `SELECT ${DEVICE_COLS} FROM devices WHERE pair_code = $1`,
    [code],
  );
  return rows[0] || null;
}

/** Cache-Speicher für createQuoteCache und das Symbolverzeichnis. */
export function createCacheStore(pool) {
  return {
    async load(kind, maxAgeSeconds) {
      const { rows } = await pool.query(
        `SELECT key, (EXTRACT(EPOCH FROM at) * 1000)::bigint AS ms, data
           FROM quote_cache
          WHERE kind = $1 AND at > now() - make_interval(secs => $2::int)`,
        [kind, Math.round(maxAgeSeconds)],
      );
      return rows.map((r) => ({ key: r.key, at: Number(r.ms), value: r.data }));
    },
    async save(kind, entries) {
      if (!entries.length) return;
      await pool.query(
        `INSERT INTO quote_cache (kind, key, at, data)
         SELECT $1, x.k, to_timestamp(x.t / 1000.0), x.d
           FROM jsonb_to_recordset($2::jsonb) AS x(k text, t bigint, d jsonb)
         ON CONFLICT (kind, key) DO UPDATE SET at = EXCLUDED.at, data = EXCLUDED.data
         RETURNING key`,
        [kind, JSON.stringify(entries.map((e) => ({ k: e.key, t: e.at, d: e.value })))],
      );
    },
  };
}

export async function getWatchlist(pool, deviceId) {
  const { rows } = await pool.query(
    `SELECT watchlist FROM devices WHERE id = $1::bigint`,
    [deviceId],
  );
  const wl = rows[0]?.watchlist;
  return Array.isArray(wl) ? wl : null;
}

export async function saveWatchlist(pool, deviceId, list) {
  await pool.query(
    `UPDATE devices SET watchlist = $2::jsonb WHERE id = $1::bigint RETURNING id`,
    [deviceId, JSON.stringify(list)],
  );
}

/** Abo-Daten aus Stripe übernehmen (per Geräte-ID oder bekannter Abo-ID). */
export async function saveSubscription(pool, { deviceId, customerId, subscriptionId, status }) {
  const { rows } = await pool.query(
    `UPDATE devices
        SET stripe_subscription_id = $2,
            stripe_customer_id     = COALESCE($3, stripe_customer_id),
            subscription_status    = $4
      WHERE id = $1::bigint OR stripe_subscription_id = $2
      RETURNING id`,
    [deviceId ?? null, subscriptionId, customerId ?? null, status],
  );
  return rows.length;
}

/** Modell und Entwickler-Flag merken (nur schreiben, wenn sich etwas ändert). */
export async function noteDeviceInfo(pool, device, { partNumber, dev }) {
  if (!partNumber || (device.part_number === partNumber && Boolean(device.dev) === dev)) return;
  await pool.query('UPDATE devices SET part_number = $2, dev = $3 WHERE id = $1::bigint', [device.id, partNumber, dev]);
}

/** Uhren je Modell (nur echte, aktive der letzten 7 Tage) */
export async function modelStats(pool) {
  const { rows } = await pool.query(`
    SELECT part_number, count(*)::int AS n FROM devices
     WHERE part_number IS NOT NULL AND dev IS NOT TRUE AND last_seen_at > now() - interval '7 days'
       AND device_uid IS DISTINCT FROM 'claude-check-providers'
     GROUP BY part_number ORDER BY n DESC, part_number LIMIT 15`);
  return rows;
}

/** Nur Summen, keine Einzeldaten: wie viele Uhren registriert/aktiv sind. */
export async function deviceStats(pool) {
  const { rows } = await pool.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE last_seen_at > now() - interval '1 day')::int AS active_1d,
           count(*) FILTER (WHERE last_seen_at > now() - interval '7 days')::int AS active_7d,
           count(*) FILTER (WHERE last_seen_at IS NULL)::int AS never_loaded,
           count(*) FILTER (WHERE jsonb_typeof(watchlist) = 'array' AND jsonb_array_length(watchlist) > 0)::int AS with_watchlist,
           count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7d,
           count(*) FILTER (WHERE device_uid = 'claude-check-providers')::int AS test,
           count(*) FILTER (WHERE dev IS TRUE)::int AS dev,
           count(*) FILTER (WHERE part_number IS NULL)::int AS unknown,
           count(*) FILTER (WHERE dev IS NOT TRUE AND part_number IS NOT NULL
                              AND device_uid IS DISTINCT FROM 'claude-check-providers')::int AS real
      FROM devices`);
  return rows[0];
}

