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
