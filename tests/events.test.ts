import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveConfig } from "../src/core/config"
import { SanctumEventEmitter } from "../src/core/events"
import { createSanctumClient } from "../src/core/http/client"
import { createAuthApi } from "../src/features/auth"
import { makeFetch } from "./helpers"

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=tok"
})

describe("419 CSRF retry", () => {
  it("retries once after refreshing CSRF on 419", async () => {
    document.cookie = "XSRF-TOKEN=tok"
    let attempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, { status: 204 })
      }
      attempts++
      return new Response(JSON.stringify({ n: attempts }), {
        status: attempts === 1 ? 419 : 200,
        headers: { "content-type": "application/json" },
      })
    })
    const config = resolveConfig({
      baseUrl: "https://api.test",
      fetch: fetchMock as unknown as typeof fetch,
    })
    const client = createSanctumClient(config)

    const result = await client.request<{ n: number }>("/api/thing", {
      method: "POST",
    })
    expect(attempts).toBe(2)
    expect(result).toEqual({ n: 2 })
  })
})

describe("event emitter isolation", () => {
  it("a throwing handler does not break emit or skip other handlers", () => {
    const emitter = new SanctumEventEmitter()
    const second = vi.fn()
    emitter.on("login", () => {
      throw new Error("boom")
    })
    emitter.on("login", second)
    expect(() => emitter.emit("login", { user: { id: 1 } })).not.toThrow()
    expect(second).toHaveBeenCalledWith({ user: { id: 1 } })
  })
})

describe("events & interceptors", () => {
  it("emits login when login succeeds", async () => {
    const { fn } = makeFetch([
      { method: "POST", path: "/login", body: { two_factor: false } },
      { method: "GET", path: "/api/user", body: { id: 1 } },
    ])
    const emitter = new SanctumEventEmitter()
    const onLogin = vi.fn()
    emitter.on("login", onLogin)
    const config = resolveConfig({ baseUrl: "https://api.test", fetch: fn })
    const client = createSanctumClient(config, { emitter })
    const auth = createAuthApi(client, config, { emitter })

    await auth.login({ email: "a@b.com", password: "x" })
    expect(onLogin).toHaveBeenCalledWith({ user: { id: 1 } })
  })

  it("emits error on 401", async () => {
    const { fn } = makeFetch([
      { method: "GET", path: "/api/posts", status: 401, body: { message: "Unauthenticated." } },
    ])
    const emitter = new SanctumEventEmitter()
    const onError = vi.fn()
    emitter.on("error", onError)
    const config = resolveConfig({ baseUrl: "https://api.test", fetch: fn })
    const client = createSanctumClient(config, { emitter })

    await expect(client.request("/api/posts")).rejects.toThrow()
    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0]?.[0]?.error?.kind).toBe("unauthorized")
  })

  it("request interceptor adds a header", async () => {
    const { fn, calls } = makeFetch([
      { method: "GET", path: "/api/user", body: { id: 1 } },
    ])
    const config = resolveConfig({
      baseUrl: "https://api.test",
      fetch: fn,
      interceptors: {
        request: [
          (req) => {
            const headers = new Headers(req.headers)
            headers.set("x-custom", "yes")
            return new Request(req, { headers })
          },
        ],
      },
    })
    const client = createSanctumClient(config)
    await client.request("/api/user")
    const call = calls.find((c) => c.url.endsWith("/api/user"))
    expect(call?.headers.get("x-custom")).toBe("yes")
  })
})
