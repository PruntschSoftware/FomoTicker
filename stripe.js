// Stripe ohne SDK: REST-Aufrufe + Webhook-Signaturprüfung mit node:crypto.
import { createHmac, timingSafeEqual } from 'node:crypto';

function encodeForm(value, prefix, out = []) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => encodeForm(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

export function createStripe(cfg) {
  const { secretKey, apiBase } = cfg.stripe;

  async function request(method, path, params) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params ? encodeForm(params).join('&') : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${body?.error?.message || 'unbekannter Fehler'}`);
    return body;
  }

  return {
    createCheckoutSession(device) {
      const id = String(device.id);
      const code = device.pair_code;
      return request('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: cfg.stripe.priceId, quantity: 1 }],
        client_reference_id: id,
        metadata: { device_id: id, pair_code: code },
        subscription_data: { metadata: { device_id: id, pair_code: code } },
        success_url: `${cfg.publicUrl}/success?code=${code}`,
        cancel_url: `${cfg.publicUrl}/?code=${code}`,
        allow_promotion_codes: true,
        locale: 'de',
        automatic_tax: cfg.stripe.automaticTax ? { enabled: true } : undefined,
        consent_collection: cfg.stripe.requireTerms ? { terms_of_service: 'required' } : undefined,
      });
    },

    getSubscription(id) {
      return request('GET', `/v1/subscriptions/${encodeURIComponent(id)}`);
    },
  };
}

/** Prüft den Stripe-Signature-Header und gibt das Event zurück (oder wirft). */
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300) {
  if (!header) throw new Error('Signatur fehlt');
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = Number(v);
    if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) throw new Error('Signatur ungültig');
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) throw new Error('Signatur abgelaufen');

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest();
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error('Signatur stimmt nicht');
  return JSON.parse(rawBody.toString('utf8'));
}
