// ─────────────────────────────────────────────────────────────
// offlineVerifier
//
// Local password verifier so OFFLINE login can't be bypassed with
// any password. Online login stays authoritative (CouchDB
// /_session). On every *successful* online login we store a
// PBKDF2-SHA-256 verifier — a random salt, an iteration count, and
// the derived hash — keyed by username. When the vault is
// unreachable, the typed password is checked against that verifier
// instead of being waved through on a username match alone.
//
// What this is NOT: it does not store the password, and it is not a
// replacement for server auth. It only re-gates the offline cache to
// the last password that authenticated online. Someone with access
// to localStorage could attempt an offline brute force; the high
// iteration count is the (inherent, unavoidable) mitigation for any
// offline password check.
//
// Web Crypto (crypto.subtle) is present in the app's secure context
// (Capacitor https://localhost, ts.net HTTPS, or localhost dev). If
// it is somehow unavailable we fail CLOSED — offline login is denied
// rather than silently re-opening the bypass.
// ─────────────────────────────────────────────────────────────

const PREFIX = 'mech_pwverify:';
const ITERATIONS = 210000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

const subtle = globalThis.crypto?.subtle || null;

function toB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password, salt, iterations) {
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// Length-safe constant-time comparison.
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// True if a verifier exists for this user (i.e. they have completed an
// online login on this device since the verifier was introduced).
export function hasOfflineVerifier(username) {
  return !!localStorage.getItem(PREFIX + username);
}

// Persist a verifier after a successful ONLINE login. Best-effort: if
// Web Crypto is unavailable we drop any stale verifier so a later
// offline attempt fails closed instead of matching an old hash.
export async function saveOfflineVerifier(username, password) {
  if (!subtle) {
    localStorage.removeItem(PREFIX + username);
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  const rec = { v: 1, it: ITERATIONS, salt: toB64(salt), hash: toB64(hash) };
  localStorage.setItem(PREFIX + username, JSON.stringify(rec));
}

// Returns true ONLY if a verifier exists for this user and the
// password matches it. Any error (no verifier, corrupt record, no
// Web Crypto) returns false → caller must deny offline access.
export async function verifyOfflinePassword(username, password) {
  if (!subtle) return false;
  const raw = localStorage.getItem(PREFIX + username);
  if (!raw) return false;
  let rec;
  try {
    rec = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!rec?.salt || !rec?.hash || !rec?.it) return false;
  const actual = await derive(password, fromB64(rec.salt), rec.it);
  return equalBytes(actual, fromB64(rec.hash));
}

// Forget the verifier (e.g. on explicit credential purge).
export function clearOfflineVerifier(username) {
  localStorage.removeItem(PREFIX + username);
}
