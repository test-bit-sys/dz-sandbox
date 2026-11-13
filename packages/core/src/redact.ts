const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-id',
  'x-api-token',
  'x-api-key',
  'x-secret-key',
  'x-dz-control-token',
  'cookie',
  'set-cookie',
]);

const SENSITIVE_KEY_NAME_RE =
  /^(?:password|pass|pwd|secret|secret_key|api_?key|api_?token|access_?token|refresh_?token|client_?secret|token|x-api-token|x-api-key|card_?number|cardpan|pan|cvv2?|cvc|authorization|bearer_?token)$/i;

const TOKEN_VALUE_RE =
  /\b(?:test_sk_|sk_live_|sk_test_|pk_live_|pk_test_|whsec_|xox[baprs]-|gh[pousr]_)[A-Za-z0-9._-]{4,}\b/g;

const CARD_NUMBER_RE = /\b(?:\d[ -]?){13,19}\b/g;

const QUERY_SECRET_PARAM_RE =
  /([?&](?:password|pass|pwd|token|api_?key|api_?token|secret|secret_?key|cardpan|pan|cvv2?|cvc)=)([^&#\s]+)/gi;

export function maskSecretValue(value: string): string {
  if (!value) return '[REDACTED]';
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('bearer ')) {
    return `Bearer ${maskRawToken(trimmed.slice(7).trim())}`;
  }
  if (lower.startsWith('basic ')) {
    return `Basic ${maskRawToken(trimmed.slice(6).trim())}`;
  }
  return maskRawToken(value);
}

function maskRawToken(raw: string): string {
  if (raw.length <= 6) {
    return '[REDACTED]';
  }
  return `***${raw.slice(-4)}`;
}

function maskCardMatch(match: string): string {
  const digits = match.replace(/[^0-9]/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return match;
  }
  return `***${digits.slice(-4)}`;
}

export function redactStringSecrets(input: string): string {
  if (!input) return input;
  let out = input.replace(QUERY_SECRET_PARAM_RE, '$1[REDACTED]');
  out = out.replace(/\b(Bearer\s+)([A-Za-z0-9._~+/-]{4,}=*)/gi, (_m, pfx: string, tok: string) => {
    return `${pfx}${maskRawToken(tok)}`;
  });
  out = out.replace(TOKEN_VALUE_RE, (tok) => maskRawToken(tok));
  out = out.replace(CARD_NUMBER_RE, maskCardMatch);
  return out;
}

export function redactUrlPath(rawUrl: string): string {
  return redactStringSecrets(rawUrl);
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const strValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      result[key] = maskSecretValue(strValue);
    } else {
      result[key] = redactStringSecrets(strValue);
    }
  }
  return result;
}

export function redactQuery(query: unknown): Record<string, unknown> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return {};
  }
  return redactBody(query) as Record<string, unknown>;
}

export function redactBody(body: unknown, depth = 0): unknown {
  if (depth > 8 || body === null || body === undefined) {
    return body;
  }
  if (typeof body === 'string') {
    return redactStringSecrets(body);
  }
  if (Array.isArray(body)) {
    return body.map((item) => redactBody(item, depth + 1));
  }
  if (typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_KEY_NAME_RE.test(key)) {
        if (typeof val === 'string' || typeof val === 'number') {
          out[key] = maskRawToken(String(val));
        } else {
          out[key] = '[REDACTED]';
        }
      } else {
        out[key] = redactBody(val, depth + 1);
      }
    }
    return out;
  }
  return body;
}
