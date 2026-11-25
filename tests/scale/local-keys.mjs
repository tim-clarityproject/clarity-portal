// The local stand-in's own made-up secret, anon key and password
// (tests/scale/stack.mjs). They open nothing but the stand-in on this
// machine, so they live in the repo. No other file may hold a key.
import { createHmac } from 'node:crypto';

export const JWT_SECRET = 'local-scale-check-only-not-a-real-secret-0123456789';
export const PASSWORD = 'scale-pass-1234';

const b64u = (b) => Buffer.from(b).toString('base64url');
export function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export const ANON_KEY = signJwt({ role: 'anon', iss: 'scale-local', iat: 1763000000, exp: 2079000000 });
