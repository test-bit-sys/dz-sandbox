#!/usr/bin/env node
/**
 * Redacts API secrets, tokens, webhook signatures, emails, phone numbers, and PANs
 * from captured provider HTTP fixtures before contributing to fixtures/<provider>/captured/.
 *
 * Usage:
 *   node scripts/redact-fixture.mjs input.json output.json
 *   cat raw.json | node scripts/redact-fixture.mjs - > sanitized.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SECRET_KEYS = new Set([
  'authorization',
  'x-api-token',
  'x-api-key',
  'x-secret-key',
  'api_key',
  'secret',
  'secret_key',
  'password',
  'token',
  'signature',
  'cookie',
  'set-cookie',
]);

const EMAIL_KEYS = new Set(['email', 'customer_email', 'client_email']);
const PHONE_KEYS = new Set(['phone', 'contact_phone', 'telephone', 'mobile']);
const CARD_KEYS = new Set(['pan', 'card_pan', 'card_number', 'cvv', 'cvc']);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?213|0)(?:5|6|7)\d{8}/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const KEY_PREFIX_RE = /\b(?:test_sk|live_sk|test_pk|live_pk|sk_live|sk_test|pk_live|pk_test)_[A-Za-z0-9_-]+/gi;
const PAN_RE = /\b(?:\d[ -]?){13,19}\b/g;

function sanitizeString(value, keyHint = '') {
  const lowerKey = keyHint.toLowerCase();
  if (SECRET_KEYS.has(lowerKey)) {
    return lowerKey.includes('token') || lowerKey === 'authorization'
      ? '[REDACTED_TOKEN]'
      : '[REDACTED_SECRET]';
  }
  if (CARD_KEYS.has(lowerKey)) {
    return lowerKey === 'cvv' || lowerKey === 'cvc' ? '[REDACTED]' : '[REDACTED_CARD_PAN]';
  }
  if (EMAIL_KEYS.has(lowerKey)) {
    return 'redacted@example.dz';
  }
  if (PHONE_KEYS.has(lowerKey)) {
    return '0550000000';
  }

  return value
    .replace(BEARER_RE, 'Bearer [REDACTED_TOKEN]')
    .replace(KEY_PREFIX_RE, '[REDACTED_API_KEY]')
    .replace(EMAIL_RE, 'redacted@example.dz')
    .replace(PHONE_RE, '0550000000')
    .replace(PAN_RE, '[REDACTED_CARD_PAN]');
}

export function redactFixtureData(input, keyHint = '') {
  if (input === null || input === undefined) {
    return input;
  }
  if (typeof input === 'string') {
    return sanitizeString(input, keyHint);
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactFixtureData(item, keyHint));
  }
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = redactFixtureData(v, k);
    }
    return out;
  }
  return input;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error('Usage: node scripts/redact-fixture.mjs <input.json | -> [output.json]');
    process.exit(1);
  }
  const raw = inputPath === '-' ? readFileSync(0, 'utf8') : readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw);
  const redacted = redactFixtureData(parsed);
  const formatted = `${JSON.stringify(redacted, null, 2)}\n`;
  if (outputPath && outputPath !== '-') {
    writeFileSync(outputPath, formatted, 'utf8');
    console.error(`Wrote sanitized fixture to ${outputPath}`);
  } else {
    process.stdout.write(formatted);
  }
}
