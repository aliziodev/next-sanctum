import { errorFromResponse, networkError } from "../errors"
import type { SanctumEventEmitter } from "../events"
import type { Logger } from "../logger"
import type { ResolvedSanctumConfig, SanctumUser } from "../types"
import { readXsrfToken } from "./csrf"
import {
  joinUrl,
  parseJson,
  STATEFUL_METHODS,
  type SanctumRequestInit,
} from "./request"

export interface SanctumClientDeps<TUser = SanctumUser> {
  logger?: Logger
  emitter?: SanctumEventEmitter<TUser>
  /** Source of the Bearer token (token mode). */
  getToken?: () => Promise<string | null> | string | null
}

export interface SanctumClient {
  readonly config: ResolvedSanctumConfig
  /** Ensure the CSRF cookie is present (cookie mode). No-op in token mode. */
  ensureCsrf(force?: boolean): Promise<void>
  /** Authenticated request → raw Response. Throws SanctumError on non-2xx. */
  raw(path: string, init?: SanctumRequestInit): Promise<Response>
  /** Authenticated request → parsed JSON body. */
  request<T>(path: string, init?: SanctumRequestInit): Promise<T>
}

/**
 * The native-fetch core used by every feature: attaches CSRF (cookie) or
 * Bearer (token), credentials, base URL, interceptors, a single 419 retry, and
 * normalizes errors.
 */
export function createSanctumClient<TUser = SanctumUser>(
  config: ResolvedSanctumConfig,
  deps: SanctumClientDeps<TUser> = {},
): SanctumClient {
  const fetchImpl = config.fetch
  const { logger, emitter } = deps

  async function fetchCsrfCookie(): Promise<void> {
    const url = joinUrl(config.baseUrl, config.endpoints.csrf)
    logger?.debug("GET", url)
    try {
      await fetchImpl(url, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      })
    } catch (cause) {
      throw networkError(cause)
    }
  }

  // De-duplicate concurrent CSRF-cookie fetches so parallel stateful requests on a
  // fresh page don't each fire (and race) a `GET /sanctum/csrf-cookie`.
  let csrfInFlight: Promise<void> | null = null

  async function ensureCsrf(force = false): Promise<void> {
    if (config.mode !== "cookie") return
    if (!force && readXsrfToken(config.csrf.cookie)) return
    if (!force && csrfInFlight) return csrfInFlight
    const pending = fetchCsrfCookie().finally(() => {
      if (csrfInFlight === pending) csrfInFlight = null
    })
    csrfInFlight = pending
    return pending
  }

  async function buildRequest(
    path: string,
    init: SanctumRequestInit,
  ): Promise<Request> {
    const url = joinUrl(config.baseUrl, path)
    const method = (init.method ?? "GET").toUpperCase()
    const headers = new Headers(init.headers)
    if (!headers.has("accept")) headers.set("accept", "application/json")

    const { json, body: rawBody, ...rest } = init
    let body = rawBody ?? null
    if (json !== undefined) {
      body = JSON.stringify(json)
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json")
      }
    }

    if (config.mode === "cookie") {
      const token = readXsrfToken(config.csrf.cookie)
      if (token && !headers.has(config.csrf.header)) {
        headers.set(config.csrf.header, token)
      }
    } else if (deps.getToken) {
      const token = await deps.getToken()
      if (token && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`)
      }
    }

    const credentials: RequestCredentials =
      config.mode === "cookie" ? "include" : (init.credentials ?? "same-origin")

    let request = new Request(url, { ...rest, method, headers, body, credentials })
    for (const interceptor of config.interceptors.request) {
      request = await interceptor(request)
    }
    return request
  }

  async function send(
    path: string,
    init: SanctumRequestInit,
    isRetry: boolean,
  ): Promise<Response> {
    const request = await buildRequest(path, init)
    emitter?.emit("request", { url: request.url, init })

    let response: Response
    try {
      response = await fetchImpl(request)
    } catch (cause) {
      const error = networkError(cause)
      emitter?.emit("error", { error })
      throw error
    }

    for (const interceptor of config.interceptors.response) {
      response = await interceptor(response, request)
    }
    emitter?.emit("response", { url: request.url, response })

    if (
      response.status === 419 &&
      config.mode === "cookie" &&
      config.retryOnCsrfMismatch &&
      !isRetry
    ) {
      logger?.warn("CSRF mismatch (419) — refresh token & retry once")
      await ensureCsrf(true)
      return send(path, init, true)
    }

    if (!response.ok) {
      const error = await errorFromResponse(response)
      emitter?.emit("error", { error })
      throw error
    }

    return response
  }

  async function raw(
    path: string,
    init: SanctumRequestInit = {},
  ): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase()
    if (config.mode === "cookie" && STATEFUL_METHODS.has(method)) {
      await ensureCsrf()
    }
    return send(path, init, false)
  }

  async function request<T>(
    path: string,
    init: SanctumRequestInit = {},
  ): Promise<T> {
    const response = await raw(path, init)
    return parseJson<T>(response)
  }

  return { config, ensureCsrf, raw, request }
}
