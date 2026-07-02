/**
 * Shared Set-Cookie parsing helpers (pure — no `next`/`server-only` imports, so this
 * stays isomorphic and tree-shakes out of the client graph). Used by `server.ts` and
 * `actions.ts` to mirror Laravel's Set-Cookie into Next's writable cookie store.
 */

export interface ParsedCookie {
  name: string
  value: string
  options: {
    path?: string
    domain?: string
    maxAge?: number
    expires?: Date
    sameSite?: "lax" | "strict" | "none"
    secure?: boolean
    httpOnly?: boolean
  }
}

/** Minimal writable cookie store. Next's `cookies()` store satisfies this. */
export interface CookieWriter {
  set(name: string, value: string, options?: ParsedCookie["options"]): void
}

/** URL-decode a cookie value, tolerating malformed percent-encoding (returned raw) —
 * a malformed cookie (e.g. tossed from a subdomain) must not throw into the request path. */
export function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Read all Set-Cookie headers as an array. Prefers `Headers.getSetCookie()` (Node ≥18.14,
 * all supported Next runtimes). The single-header fallback only handles one cookie — we do
 * NOT attempt to comma-split, which is unreliable (Expires dates contain commas).
 */
export function getSetCookies(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie()
  const value = headers.get("set-cookie")
  return value ? [value] : []
}

/** Parse a single Set-Cookie header. Validates attributes; returns null when unusable. */
export function parseSetCookie(header: string): ParsedCookie | null {
  const segments = header.split(";")
  const first = segments.shift()
  if (!first) return null
  const eq = first.indexOf("=")
  if (eq === -1) return null
  const name = first.slice(0, eq).trim()
  if (name === "") return null
  let value = first.slice(eq + 1).trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }

  const options: ParsedCookie["options"] = {}
  for (const segment of segments) {
    const idx = segment.indexOf("=")
    const key = (idx === -1 ? segment : segment.slice(0, idx)).trim().toLowerCase()
    const val = idx === -1 ? "" : segment.slice(idx + 1).trim()
    switch (key) {
      case "path":
        options.path = val
        break
      case "domain":
        options.domain = val
        break
      case "max-age": {
        const n = Number(val)
        if (val !== "" && Number.isFinite(n)) options.maxAge = n
        break
      }
      case "expires": {
        const d = new Date(val)
        if (!Number.isNaN(d.getTime())) options.expires = d
        break
      }
      case "samesite": {
        const lower = val.toLowerCase()
        if (lower === "lax" || lower === "strict" || lower === "none") {
          options.sameSite = lower
        }
        break
      }
      case "secure":
        options.secure = true
        break
      case "httponly":
        options.httpOnly = true
        break
    }
  }
  return { name, value, options }
}

/** Mirror a response's Set-Cookie headers into a writable cookie store. */
export function applySetCookies(store: CookieWriter, response: Response): void {
  for (const raw of getSetCookies(response.headers)) {
    const parsed = parseSetCookie(raw)
    if (!parsed) continue
    try {
      store.set(parsed.name, parsed.value, parsed.options)
    } catch {
      // store is read-only (e.g. called from a Server Component) — ignore.
    }
  }
}
