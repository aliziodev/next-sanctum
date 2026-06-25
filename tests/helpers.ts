import { vi } from "vitest"
import { resolveConfig } from "../src/core/config"
import { createSanctumClient } from "../src/core/http/client"
import type { SanctumConfig } from "../src/core/types"

export interface MockRoute {
  method: string
  path: string
  status?: number
  body?: unknown
}

export interface CallRecord {
  url: string
  method: string
  headers: Headers
  body: string | null
}

/** Mock fetch that matches routes by (method, pathname) & records the request. */
export function makeFetch(routes: MockRoute[]) {
  const calls: CallRecord[] = []
  const fn = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url: string
      let method: string
      let headers: Headers
      let body: string | null = null
      if (input instanceof Request) {
        url = input.url
        method = input.method.toUpperCase()
        headers = input.headers
        try {
          const text = await input.clone().text()
          body = text === "" ? null : text
        } catch {
          body = null
        }
      } else {
        url = String(input)
        method = (init?.method ?? "GET").toUpperCase()
        headers = new Headers(init?.headers)
        body = typeof init?.body === "string" ? init.body : null
      }
      calls.push({ url, method, headers, body })
      const path = new URL(url).pathname
      const route = routes.find((r) => r.method === method && path === r.path)
      if (!route) return new Response(null, { status: 404 })
      const status = route.status ?? 200
      const resBody = route.body === undefined ? null : JSON.stringify(route.body)
      return new Response(resBody, {
        status,
        headers: { "content-type": "application/json" },
      })
    },
  )
  return { fn: fn as unknown as typeof fetch, calls }
}

export function setupClient(
  routes: MockRoute[],
  overrides: Partial<SanctumConfig> = {},
) {
  const { fn, calls } = makeFetch(routes)
  const config = resolveConfig({ baseUrl: "https://api.test", fetch: fn, ...overrides })
  const client = createSanctumClient(config)
  return { client, config, calls }
}
