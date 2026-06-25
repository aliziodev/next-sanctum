import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveConfig } from "../src/core/config"
import { createSanctumClient } from "../src/core/http/client"
import { createAuthApi } from "../src/features/auth"
import type { SanctumConfig } from "../src/core/types"

interface MockRoute {
  method: string
  path: string
  status?: number
  body?: unknown
}

interface CallRecord {
  url: string
  method: string
  headers: Headers
}

function makeFetch(routes: MockRoute[]) {
  const calls: CallRecord[] = []
  const fn = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url: string
      let method: string
      let headers: Headers
      if (input instanceof Request) {
        url = input.url
        method = input.method.toUpperCase()
        headers = input.headers
      } else {
        url = String(input)
        method = (init?.method ?? "GET").toUpperCase()
        headers = new Headers(init?.headers)
      }
      calls.push({ url, method, headers })
      const path = new URL(url).pathname
      const route = routes.find((r) => r.method === method && path.endsWith(r.path))
      if (!route) return new Response(null, { status: 404 })
      const status = route.status ?? 200
      const body = route.body === undefined ? null : JSON.stringify(route.body)
      return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      })
    },
  )
  return { fn: fn as unknown as typeof fetch, calls }
}

function setup(routes: MockRoute[], overrides: Partial<SanctumConfig> = {}) {
  const { fn, calls } = makeFetch(routes)
  const config = resolveConfig({ baseUrl: "https://api.test", fetch: fn, ...overrides })
  const client = createSanctumClient(config)
  const auth = createAuthApi(client, config)
  return { auth, client, config, calls }
}

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=; Max-Age=0"
})

describe("auth.login (cookie mode)", () => {
  it("login success → authenticated + sends X-XSRF-TOKEN header", async () => {
    document.cookie = "XSRF-TOKEN=tok123"
    const { auth, calls } = setup([
      { method: "GET", path: "/sanctum/csrf-cookie", status: 204 },
      { method: "POST", path: "/login", body: { two_factor: false } },
      { method: "GET", path: "/api/user", body: { id: 1, name: "Budi" } },
    ])

    const result = await auth.login({ email: "a@b.com", password: "secret" })

    expect(result.status).toBe("authenticated")
    if (result.status === "authenticated") {
      expect(result.user).toEqual({ id: 1, name: "Budi" })
    }
    const loginCall = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/login"),
    )
    expect(loginCall?.headers.get("X-XSRF-TOKEN")).toBe("tok123")
  })

  it("two_factor:true → two-factor-required, does NOT fetch user", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { auth, calls } = setup([
      { method: "POST", path: "/login", body: { two_factor: true } },
      { method: "GET", path: "/api/user", body: { id: 1 } },
    ])

    const result = await auth.login({ email: "a@b.com", password: "x" })

    expect(result.status).toBe("two-factor-required")
    expect(calls.some((c) => c.url.endsWith("/api/user"))).toBe(false)
  })

  it("refreshIdentity → null on 401", async () => {
    const { auth } = setup([
      { method: "GET", path: "/api/user", status: 401, body: { message: "Unauthenticated." } },
    ])
    expect(await auth.refreshIdentity()).toBeNull()
  })

  it("login throws ValidationError on 422", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    const { auth } = setup([
      {
        method: "POST",
        path: "/login",
        status: 422,
        body: { message: "Invalid data.", errors: { email: ["The email field is required."] } },
      },
    ])

    await expect(auth.login({ email: "", password: "" })).rejects.toMatchObject({
      kind: "validation",
      errors: { email: ["The email field is required."] },
    })
  })
})
