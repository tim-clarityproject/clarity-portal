// The 6-digit code an authenticator app shows (RFC 6238: HMAC-SHA1, 30
// second steps), worked out from a factor's secret, for the coach sign-in
// test. The secret is never printed.
import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fromBase32(text) {
  let bits = '';
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const number = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(number % 1000000).padStart(6, '0');
}

/** Waits until a new 30-second step has begun, so a code is never used twice. */
export async function nextStep() {
  const left = 30000 - (Date.now() % 30000);
  await new Promise((r) => setTimeout(r, left + 1200));
}
