// Small cryptographic helpers shared by the OAuth server and the authentication check.
// Everything uses Web Crypto, available both in Cloudflare Workers and in Node.
import { digest } from './projects.js';

const encoder = new TextEncoder();
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const sha256Hex = digest;

export function base64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64url(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function randomId() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

// Compares two strings without stopping at the first difference, so response time
// does not reveal how many leading characters of a secret were guessed correctly.
export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index % (right.length || 1));
  }
  return difference === 0;
}

export function isSigningSecret(secret) {
  return SECRET_PATTERN.test(secret ?? '');
}

// HMAC signature: only someone holding the server secret can produce it.
// `purpose` keeps signatures made for one use from being accepted for another.
async function sign(secret, purpose, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}\n${text}`)));
}

// Opaque token "<prefix><random>.<signature>". The signature lets the server discard
// forged tokens without querying the database; the database stores only a SHA-256.
export async function mintToken(secret, prefix) {
  const id = randomId();
  return `${prefix}${id}.${await sign(secret, 'token', prefix + id)}`;
}

export async function isMintedToken(secret, prefix, token) {
  if (typeof token !== 'string' || !token.startsWith(prefix)) return false;
  const [id, signature, ...rest] = token.slice(prefix.length).split('.');
  if (rest.length || !/^[A-Za-z0-9_-]{43}$/.test(id ?? '') || !signature) return false;
  return safeEqual(signature, await sign(secret, 'token', prefix + id));
}

// Signed (not encrypted) JSON: readable by its holder but impossible to alter.
export async function sealJson(secret, purpose, value) {
  const body = base64url(encoder.encode(JSON.stringify(value)));
  return `${body}.${await sign(secret, purpose, body)}`;
}

// Returns the original value, or null when the signature is wrong or `exp` has passed.
export async function openJson(secret, purpose, sealed, now) {
  if (typeof sealed !== 'string' || sealed.length > 8192) return null;
  const [body, signature, ...rest] = sealed.split('.');
  if (rest.length || !body || !signature || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  if (!safeEqual(signature, await sign(secret, purpose, body))) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    if (value === null || typeof value !== 'object') return null;
    if (value.exp !== undefined && !(value.exp > now)) return null;
    return value;
  } catch { return null; }
}
