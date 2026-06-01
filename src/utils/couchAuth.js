// ─────────────────────────────────────────────────────────────
// couchAuth
//
// Thin wrapper around CouchDB's /_session endpoint.
//
// On successful POST /_session, CouchDB sets an `AuthSession`
// cookie marked HttpOnly + Path=/. Subsequent fetches with
// `credentials: 'include'` carry the cookie, which means the
// password is no longer needed per-request.
//
// IMPORTANT — cookie persistence by transport:
//
//   * App and CouchDB on HTTPS, same origin (or cross-origin with
//     CouchDB setting SameSite=None; Secure) → cookie persists.
//     This is the target state after the HTTPS migration.
//
//   * Cross-origin HTTP (Capacitor `https://localhost` →
//     `http://<tailnet>:5984`, current state) → modern browsers
//     default SameSite=Lax which blocks cookies on cross-origin
//     XHR/fetch. The cookie still gets *set* by the response, but
//     it won't be *sent* on subsequent requests. PouchDB falls
//     back to Basic Auth via the in-memory password.
//
// Either way, this module is safe to call — `couchLogin` throws
// on bad credentials, so we still get a real auth gate at the
// BootScreen. The cookie advantage just becomes load-bearing once
// HTTPS is in place.
// ─────────────────────────────────────────────────────────────

function endpointOf(host) {
  if (!host) return null;
  // Strip whitespace + any trailing slashes BEFORE prepending the
  // protocol. Without this, a host saved as 'foo.ts.net/' produced
  // 'https://foo.ts.net//_session' — double slash, 404.
  const h = host.trim().replace(/\/+$/, '');
  if (!h) return null;
  if (/^https?:\/\//.test(h)) return h;
  const protocol = h.includes('ts.net') ? 'https://' : 'http://';
  return `${protocol}${h}`;
}

export function couchEndpoint(host) {
  return endpointOf(host);
}

export async function couchLogin(host, username, password) {
  const base = endpointOf(host);
  if (!base) throw new Error('NO HOST');

  const body = new URLSearchParams({ name: username, password }).toString();
  const res = await fetch(`${base}/_session`, {
    method:      'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
    },
    body,
  });

  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try { reason = (await res.json()).reason || reason; } catch (_) {}
    const err = new Error(reason);
    err.status = res.status;
    throw err;
  }

  // { ok: true, name, roles }
  return res.json();
}

export async function couchLogout(host) {
  const base = endpointOf(host);
  if (!base) return;
  try {
    await fetch(`${base}/_session`, {
      method:      'DELETE',
      credentials: 'include',
    });
  } catch (_) {
    /* offline / unreachable — local cookie state still cleared by app */
  }
}

export async function couchWhoami(host) {
  const base = endpointOf(host);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/_session`, {
      credentials: 'include',
      headers:     { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.userCtx?.name || null;
  } catch (_) {
    return null;
  }
}
