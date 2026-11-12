import { timingSafeEqual } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HOST_HEADER_RE = /^[A-Za-z0-9.\-:[\]]{1,255}$/;
const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'set-cookie',
]);

function normalizeHostInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isLoopbackHostOrIp(hostOrIp: string): boolean {
  const host = normalizeHostInput(hostOrIp);
  if (host === 'localhost' || host === '::1') return true;
  if (host.startsWith('::ffff:')) {
    return isLoopbackHostOrIp(host.slice(7));
  }
  if (net.isIPv4(host)) {
    const firstOctet = Number.parseInt(host.split('.')[0] ?? '', 10);
    return firstOctet === 127;
  }
  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number.parseInt(part, 10);
    if (n < 0 || n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

function isNonCanonicalIpv4Notation(host: string): boolean {
  // Reject integer (2130706433), octal (0177.0.0.1), or hex (0x7f.0.0.1) IP literals
  if (/^\d+$/.test(host)) return true;
  if (/^0x[0-9a-f]+(\.[0-9a-fx]+)*$/i.test(host)) return true;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every((p) => /^(?:0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(p))) {
    return !net.isIPv4(host);
  }
  return false;
}

export function isPrivateOrReservedIpOrHost(hostOrIp: string): boolean {
  const host = normalizeHostInput(hostOrIp);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (isNonCanonicalIpv4Notation(host)) {
    return true;
  }

  if (net.isIPv4(host)) {
    const n = ipv4ToInt(host);
    if (n === null) return true;
    const o1 = (n >>> 24) & 0xff;
    const o2 = (n >>> 16) & 0xff;
    if (o1 === 0) return true; // 0.0.0.0/8
    if (o1 === 10) return true; // 10.0.0.0/8
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 CGNAT
    if (o1 === 127) return true; // 127.0.0.0/8 loopback
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
    if (o1 === 192 && o2 === 0 && ((n >>> 8) & 0xff) === 0) return true; // 192.0.0.0/24
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // 198.18.0.0/15 benchmark
    if (o1 >= 224) return true; // multicast + reserved
    return false;
  }

  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1') return true;
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice(7);
      if (net.isIPv4(mapped)) return isPrivateOrReservedIpOrHost(mapped);
      // Hex-encoded ::ffff:7f00:0001 / ::ffff:a9fe:a9fe
      const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
      if (hexMatch) {
        const hi = Number.parseInt(hexMatch[1]!, 16);
        const lo = Number.parseInt(hexMatch[2]!, 16);
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIpOrHost(ipv4);
      }
      return true;
    }
    const firstHextet = Number.parseInt(host.split(':')[0] || '0', 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }

  return false;
}

function extractRawAuthorityHost(rawUrl: string): string | null {
  const m = /^https?:\/\/([^/?#]+)/i.exec(rawUrl.trim());
  if (!m) return null;
  const authority = m[1]!;
  const atIdx = authority.lastIndexOf('@');
  const hostPort = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    return end >= 0 ? hostPort.slice(1, end) : hostPort;
  }
  const colonIdx = hostPort.indexOf(':');
  return colonIdx >= 0 ? hostPort.slice(0, colonIdx) : hostPort;
}

export function isSafeHttpUrl(rawUrl: string): boolean {
  if (!rawUrl || /[\r\n\0]/.test(rawUrl)) {
    return false;
  }
  const rawHost = extractRawAuthorityHost(rawUrl);
  if (rawHost && isNonCanonicalIpv4Notation(rawHost)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  if (!parsed.hostname) {
    return false;
  }
  return true;
}

export function sanitizeRedirectUrl(rawUrl: string): string | null {
  if (!isSafeHttpUrl(rawUrl)) return null;
  const parsed = new URL(rawUrl);
  if (/[\r\n\0]/.test(parsed.toString())) return null;
  return parsed.toString();
}

export function sanitizeHostHeader(rawHost: string | undefined, fallback: string): string {
  if (!rawHost || !HOST_HEADER_RE.test(rawHost.trim())) {
    return fallback;
  }
  return rawHost.trim();
}

export function sanitizeHeaderEntry(
  name: string,
  value: string,
): { safe: boolean; reason?: string } {
  if (!HEADER_NAME_RE.test(name)) {
    return { safe: false, reason: `Invalid header name: ${name}` };
  }
  if (FORBIDDEN_RESPONSE_HEADERS.has(name.toLowerCase())) {
    return { safe: false, reason: `Forbidden scenario header: ${name}` };
  }
  if (/[\r\n\0]/.test(value)) {
    return { safe: false, reason: `Header value contains control characters: ${name}` };
  }
  return { safe: true };
}

export function resolvePathInsideDir(baseDir: string, entryName: string): string {
  const baseReal = realpathSync(baseDir);
  const candidatePath = path.resolve(baseReal, entryName);
  const stat = lstatSync(candidatePath);
  const resolved = realpathSync(candidatePath);
  const rel = path.relative(baseReal, resolved);
  if (!rel || rel === '.' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes allowed directory: ${entryName}`);
  }
  if (stat.isDirectory()) {
    throw new Error(`Expected file inside scenario directory, got directory: ${entryName}`);
  }
  return resolved;
}

export function timingSafeEqualToken(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
