import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Computes lowercase hex HMAC-SHA256 signature over raw payload string.
 */
export function signHmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Constant-time HMAC-SHA256 verification helper.
 */
export function verifyHmacSha256(payload: string, secret: string, signature: string): boolean {
  if (!signature || !secret) return false;
  const expected = signHmacSha256(payload, secret);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}
