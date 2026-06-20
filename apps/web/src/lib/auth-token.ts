/**
 * A tiny bridge so non-React modules (api.ts, sse.ts) can attach the current
 * Firebase ID token to requests. The AuthProvider registers a provider fn
 * whenever the signed-in user changes.
 */

type TokenProvider = (() => Promise<string | null>) | null;

let provider: TokenProvider = null;

export function setTokenProvider(fn: TokenProvider): void {
  provider = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!provider) return null;
  try {
    return await provider();
  } catch {
    return null;
  }
}

/** Authorization header object, or empty when no user is signed in. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
