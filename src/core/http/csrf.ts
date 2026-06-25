/**
 * CSRF cookie reading (browser). Sanctum stores `XSRF-TOKEN` in URL-encoded
 * form, so its value MUST be decoded before being sent as the
 * `X-XSRF-TOKEN` header (the most common source of Sanctum integration bugs).
 */

/** Read a single cookie from document.cookie. Null on the server (no document). */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const cookies = document.cookie ? document.cookie.split("; ") : []
  for (const cookie of cookies) {
    const eq = cookie.indexOf("=")
    const key = eq === -1 ? cookie : cookie.slice(0, eq)
    if (key === name) {
      return eq === -1 ? "" : cookie.slice(eq + 1)
    }
  }
  return null
}

/** Read the XSRF token from the cookie, then URL-decode it. */
export function readXsrfToken(cookieName: string): string | null {
  const raw = readCookie(cookieName)
  if (raw === null) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
