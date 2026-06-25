import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export interface SanctumProxyRedirectOptions {
  onAuthOnly?: string
  onGuestOnly?: string
  /** Persist the original path in `?redirect=` (same-origin) on auth-only redirects. */
  keepRequestedRoute?: boolean
}

export interface SanctumProxyOptions {
  /** Paths that require login (e.g. `['/dashboard/:path*']`). */
  authOnly?: string[]
  /** Guest-only paths (e.g. `['/login', '/register']`). */
  guestOnly?: string[]
  /**
   * Session marker cookie for the OPTIMISTIC check. Defaults to `['laravel_session']`.
   * Note: this is optimistic only — real authorization MUST live in a Server Component /
   * Server Action (see getUser()).
   */
  sessionCookie?: string | string[]
  redirect?: SanctumProxyRedirectOptions
}

/** Convert a Next-style pattern (`:param`, `:param*`, `*`) into a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/:[A-Za-z0-9_]+\*/g, ".*")
    .replace(/:[A-Za-z0-9_]+/g, "[^/]+")
    .replace(/\*/g, ".*")
  return new RegExp(`^${escaped}/?$`)
}

function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => patternToRegExp(pattern).test(pathname))
}

function hasSession(request: NextRequest, names: string[]): boolean {
  return names.some((name) => Boolean(request.cookies.get(name)?.value))
}

/**
 * Optimistic route guard for `proxy.ts` (modern Next.js). Reads cookies only —
 * lightweight & runtime-agnostic. Real authorization stays close to the data source.
 */
export function createSanctumProxy(options: SanctumProxyOptions = {}) {
  const authOnly = options.authOnly ?? []
  const guestOnly = options.guestOnly ?? []
  const sessionCookies = Array.isArray(options.sessionCookie)
    ? options.sessionCookie
    : [options.sessionCookie ?? "laravel_session"]
  const onAuthOnly = options.redirect?.onAuthOnly ?? "/login"
  const onGuestOnly = options.redirect?.onGuestOnly ?? "/"
  const keepRequestedRoute = options.redirect?.keepRequestedRoute ?? false

  return function proxy(request: NextRequest): NextResponse {
    const { pathname, search } = request.nextUrl
    const authed = hasSession(request, sessionCookies)

    if (!authed && matchesAny(pathname, authOnly)) {
      const url = request.nextUrl.clone()
      url.pathname = onAuthOnly
      url.search = ""
      if (keepRequestedRoute) {
        url.searchParams.set("redirect", pathname + search)
      }
      return NextResponse.redirect(url)
    }

    if (authed && matchesAny(pathname, guestOnly)) {
      const url = request.nextUrl.clone()
      url.pathname = onGuestOnly
      url.search = ""
      return NextResponse.redirect(url)
    }

    return NextResponse.next()
  }
}
