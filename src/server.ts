import "server-only"
import { cookies } from "next/headers"
import {
  applySetCookies,
  ConfigError,
  getSetCookies,
  resolveServerBaseUrl,
  STATEFUL_METHODS,
} from "./core"
import type { SanctumUser } from "./core"

export { safeRedirect } from "./core"
export type { SafeRedirectOptions } from "./core"

const CSRF_COOKIE_ENDPOINT = "/sanctum/csrf-cookie"

export interface ServerFetchInit extends Omit<RequestInit, "body"> {
  body?: BodyInit | null
  /** Shortcut for a JSON body + content-type. */
  json?: unknown
  /** Override the base URL (defaults to env). */
  baseUrl?: string
  /** CSRF cookie/header names (default XSRF-TOKEN / X-XSRF-TOKEN). */
  csrf?: { cookie?: string; header?: string }
}

/**
 * Anti-SSRF: an absolute URL is only allowed when it matches the configured base
 * origin, otherwise the (cookie-bearing) request could be aimed at an arbitrary host.
 */
function buildServerUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    if (new URL(path).origin !== new URL(baseUrl).origin) {
      throw new ConfigError(
        "serverFetch: an absolute URL must match the configured base URL origin (anti-SSRF).",
      )
    }
    return path
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Authenticated fetch from a SERVER context (Server Component / Route Handler /
 * Server Action). Forwards cookies from `await cookies()` to Laravel. For stateful
 * requests it includes the CSRF header, bootstrapping the CSRF cookie when missing
 * (the bootstrap can only persist cookies from a Server Action / Route Handler).
 */
export async function serverFetch(
  path: string,
  init: ServerFetchInit = {},
): Promise<Response> {
  const baseUrl = resolveServerBaseUrl(init.baseUrl)
  const cookieStore = await cookies()

  const { json, body: rawBody, baseUrl: _baseUrl, csrf, ...rest } = init
  const headers = new Headers(rest.headers)
  if (!headers.has("accept")) headers.set("accept", "application/json")

  const method = (rest.method ?? "GET").toUpperCase()
  const csrfCookieName = csrf?.cookie ?? "XSRF-TOKEN"
  const csrfHeaderName = csrf?.header ?? "X-XSRF-TOKEN"

  if (STATEFUL_METHODS.has(method)) {
    let token = cookieStore.get(csrfCookieName)?.value
    if (!token) {
      const csrfResponse = await fetch(`${baseUrl}${CSRF_COOKIE_ENDPOINT}`, {
        headers: { cookie: cookieStore.toString(), accept: "application/json" },
        cache: "no-store",
      })
      applySetCookies(cookieStore, csrfResponse)
      token = cookieStore.get(csrfCookieName)?.value
    }
    if (token && !headers.has(csrfHeaderName)) {
      headers.set(csrfHeaderName, decodeURIComponent(token))
    }
  }

  const cookieHeader = cookieStore.toString()
  if (cookieHeader) headers.set("cookie", cookieHeader)

  let body = rawBody ?? null
  if (json !== undefined) {
    body = JSON.stringify(json)
    if (!headers.has("content-type")) headers.set("content-type", "application/json")
  }

  return fetch(buildServerUrl(baseUrl, path), {
    ...rest,
    method,
    headers,
    body,
    cache: rest.cache ?? "no-store",
  })
}

export interface GetUserOptions {
  baseUrl?: string
  /** User endpoint, default `/api/user`. */
  endpoint?: string
}

/**
 * Fetch the authenticated user on the server (forwards cookies). The result is passed
 * as `initialUser` to SanctumProvider to prevent a hydration mismatch. Network/parse
 * errors resolve to `null` (treated as logged-out) so SSR doesn't crash; a missing
 * `SANCTUM_BASE_URL` still throws (fail-fast).
 */
export async function getUser<TUser = SanctumUser>(
  options: GetUserOptions = {},
): Promise<TUser | null> {
  try {
    const response = await serverFetch(options.endpoint ?? "/api/user", {
      method: "GET",
      baseUrl: options.baseUrl,
    })
    if (!response.ok) return null
    return (await response.json()) as TUser
  } catch (error) {
    if (error instanceof ConfigError) throw error
    return null
  }
}

// ── Catch-all server proxy (anti-SSRF) ───────────────────────────────────────

export interface SanctumRouteProxyOptions {
  /** Laravel base URL — PINNED (anti-SSRF). Must be an absolute http(s) URL. */
  upstream: string
  /** Forward cookies from the request (default true). */
  forwardCookies?: boolean
}

interface RouteContext {
  params: Promise<{ path?: string[] }>
}

const FORWARD_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "authorization",
  "x-xsrf-token",
  "x-requested-with",
]

// Allowlist of response headers forwarded to the client — internal/debug headers
// (Server, X-Powered-By, X-Debug-*, rate-limit internals, …) are stripped by default.
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-language",
  "content-disposition",
  "cache-control",
  "etag",
  "expires",
  "last-modified",
  "location",
  "vary",
  "www-authenticate",
]

/**
 * Create a catch-all Route Handler (`app/api/sanctum/[...path]/route.ts`) that
 * forwards requests to Laravel via the Next domain. **Anti-SSRF**: `upstream` is pinned,
 * path traversal (`..`, `://`, backslash) is rejected, and only an allowlist of
 * response headers (plus Set-Cookie) is forwarded — internal headers are not leaked.
 */
export function createSanctumRouteProxy(options: SanctumRouteProxyOptions) {
  const upstream = options.upstream.replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(upstream)) {
    throw new ConfigError(
      "createSanctumRouteProxy: `upstream` must be an absolute http(s) URL (anti-SSRF).",
    )
  }
  const forwardCookies = options.forwardCookies ?? true

  return async function handler(
    request: Request,
    context: RouteContext,
  ): Promise<Response> {
    const { path = [] } = await context.params
    for (const segment of path) {
      if (
        segment === ".." ||
        segment === "." ||
        segment.includes("\\") ||
        segment.includes("://")
      ) {
        return new Response("Bad request", { status: 400 })
      }
    }

    const suffix = path.map(encodeURIComponent).join("/")
    const search = new URL(request.url).search
    const target = `${upstream}/${suffix}${search}`

    const headers = new Headers()
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (forwardCookies) {
      const cookie = request.headers.get("cookie")
      if (cookie) headers.set("cookie", cookie)
    }

    const method = request.method.toUpperCase()
    const hasBody = method !== "GET" && method !== "HEAD"
    const body = hasBody ? await request.arrayBuffer() : undefined

    const upstreamResponse = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
    })

    const responseHeaders = new Headers()
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }
    for (const cookie of getSetCookies(upstreamResponse.headers)) {
      responseHeaders.append("set-cookie", cookie)
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    })
  }
}
