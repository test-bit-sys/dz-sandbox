const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'x-api-token',
  'x-api-key',
  'x-secret-key',
  'cookie',
  'set-cookie',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'secret',
  'secret_key',
  'api_key',
  'token',
  'x-api-token',
  'card_number',
  'cvv',
  'cvc',
  'pan',
]);

export function maskSecretValue(value: string): string {
  if (!value) return '[REDACTED]';
  const bearerMatch = /^(Bearer\s+)(.+)$/i.exec(value);
  if (bearerMatch) {
    const prefix = bearerMatch[1] ?? 'Bearer ';
    const secret = bearerMatch[2] ?? '';
    return `${prefix}${maskRawToken(secret)}`;
  }
  return maskRawToken(value);
}

function maskRawToken(raw: string): string {
  if (raw.length <= 6) {
    return '[REDACTED]';
  }
  return `***${raw.slice(-4)}`;
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const strValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      result[key] = maskSecretValue(strValue);
    } else {
      result[key] = strValue;
    }
  }
  return result;
}

export function redactBody(body: unknown, depth = 0): unknown {
  if (depth > 8 || body === null || body === undefined) {
    return body;
  }
  if (Array.isArray(body)) {
    return body.map((item) => redactBody(item, depth + 1));
  }
  if (typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_BODY_KEYS.has(key.toLowerCase()) && typeof val === 'string') {
        out[key] = maskRawToken(val);
      } else {
        out[key] = redactBody(val, depth + 1);
      }
    }
    return out;
  }
  return body;
}
