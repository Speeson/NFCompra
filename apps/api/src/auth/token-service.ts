import type { Env } from '../env';

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function createRandomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

export async function createAccessToken(userId: string, sessionVersion: number, env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({ sub: userId, session_version: sessionVersion, iat: now, exp: now + 15 * 60 })));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${base64Url(await hmac(env.JWT_SECRET, signingInput))}`;
}

export interface AccessTokenSession {
  userId: string;
  sessionVersion: number;
}

export async function verifyAccessToken(token: string, env: Env): Promise<AccessTokenSession | null> {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  if (!equal(decodeBase64Url(signature), await hmac(env.JWT_SECRET, `${header}.${payload}`))) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { sub?: unknown; session_version?: unknown; exp?: unknown };
    if (typeof claims.sub !== 'string'
      || typeof claims.session_version !== 'number'
      || !Number.isInteger(claims.session_version)
      || typeof claims.exp !== 'number'
      || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return { userId: claims.sub, sessionVersion: claims.session_version };
  } catch {
    return null;
  }
}
