/** URL & body utilities for the request builder. Pure & easy to test. */
import { SanctumError } from "../errors"

/** HTTP methods that require CSRF protection in cookie mode. */
export const STATEFUL_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Join baseUrl + path. Absolute paths (http/https) are passed through as-is. */
export function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
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
