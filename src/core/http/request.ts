/** URL & body utilities for the request builder. Pure & easy to test. */
import { ConfigError, SanctumError } from "../errors"

/** HTTP methods that require CSRF protection in cookie mode. */
export const STATEFUL_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Origin of the configured baseUrl. A relative baseUrl (same-origin proxy setup) is
 * resolved against the browser origin; null when indeterminate (callers fail closed). */
function baseOrigin(baseUrl: string): string | null {
  try {
    if (typeof window !== "undefined") {
      return new URL(baseUrl, window.location.origin).origin
    }
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

/**
 * Join baseUrl + path. An absolute http(s) path is allowed ONLY when its origin
 * matches `baseUrl`: the client attaches credentials (the CSRF header in cookie mode,
 * the Bearer token in token mode) to every request, so a cross-origin absolute path
 * would leak them (mirrors serverFetch's anti-SSRF guard).
 */
export function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    if (new URL(path).origin !== baseOrigin(baseUrl)) {
      throw new ConfigError(
        "An absolute URL must match the configured `baseUrl` origin — credentials (CSRF/Bearer) are attached to every request and must not be sent cross-origin.",
      )
    }
    return path
  }
  const base = baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  return base + suffix
}

export interface SanctumRequestInit extends Omit<RequestInit, "body"> {
  body?: BodyInit | null
  /** Shortcut: serialize to JSON + set content-type automatically. */
  json?: unknown
}

/**
 * Parse the response body as JSON. Returns `undefined` (cast to T)
 * for 204 / an empty body so the caller doesn't need a manual try/catch.
 */
export async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (text.length === 0) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch (cause) {
    throw new SanctumError("Failed to parse the JSON response body.", {
      kind: "unknown",
      status: response.status,
      cause,
    })
  }
}
