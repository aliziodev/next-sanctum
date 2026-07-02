import "server-only"
import { cookies } from "next/headers"
import {
  applySetCookies,
  ConfigError,
  decodeCookieValue,
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
 *
 * **Security — stateful methods (POST/PUT/PATCH/DELETE):** this helper bootstraps and
 * echoes Laravel's CSRF token itself and presents a first-party Origin, so Laravel's
 * CSRF check no longer distinguishes cross-site calls. Server Actions are safe (Next
 * validates their Origin against the Host), but a plain Route Handler has NO such
 * check — validate `request.headers.get("origin")` against your app origin yourself
 * before making stateful calls from one, or a cross-site POST could trigger them.
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

  // Sanctum's statefulApi() only treats a request as first-party (session/cookie
  // auth) when its Origin/Referer matches a stateful domain. A server-side fetch
  // carries no browser Origin, so present the API's own origin — which Sanctum
  // always includes in its stateful domains by default — so SSR cookie auth
  // (e.g. getUser() in a Server Component) is recognised instead of 401-ing.
  if (!headers.has("origin")) headers.set("origin", new URL(baseUrl).origin)

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
      headers.set(csrfHeaderName, decodeCookieValue(token))
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
  // Sanctum's SPA (cookie) auth only treats a request as "stateful" when it
  // carries an Origin or Referer matching SANCTUM_STATEFUL_DOMAINS. Forwarding
  // them lets the canonical `routes/api.php` + `auth:sanctum` pattern work
  // through this proxy. Safe: `upstream` is pinned (anti-SSRF preserved).
  "origin",
  "referer",
  // Without this, Laravel sees every user as the Next server's IP — per-IP
  // throttling (login lockout) becomes one shared bucket and audit logs are
  // useless. Only trustworthy when a proxy you control sets it (and Laravel's
  // TrustProxies is configured); a direct client can spoof it either way.
  "x-forwarded-for",
  // Without this, Laravel records the Next server's runtime UA ("node") for every
  // request — device-session lists and audit logs then show "Unknown browser".
  // Forward the real browser User-Agent instead.
  "user-agent",
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
    // Proxied responses are authenticated per-user; when the upstream doesn't say
    // otherwise, forbid caching so a shared cache/CDN can't serve one user's data
    // to another.
    if (!responseHeaders.has("cache-control")) {
      responseHeaders.set("cache-control", "no-store")
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
