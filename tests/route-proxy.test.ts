// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { createSanctumRouteProxy } from "../src/server"

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("createSanctumRouteProxy", () => {
  it("pins upstream & forwards path + query + cookie", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("ok", { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })

    const req = new Request("https://app.test/api/sanctum/api/user?x=1", {
      headers: { cookie: "laravel_session=abc" },
    })
    const res = await handler(req, ctx(["api", "user"]))

    expect(res.status).toBe(200)
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe("https://api.laravel.test/api/user?x=1")
    expect((call?.[1]?.headers as Headers).get("cookie")).toBe(
      "laravel_session=abc",
    )
  })

  it("rejects path traversal (..)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(
      new Request("https://app.test/x"),
      ctx(["..", "etc", "passwd"]),
    )
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects absolute segments (://)", async () => {
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(
      new Request("https://app.test/x"),
      ctx(["http://evil.com"]),
    )
    expect(res.status).toBe(400)
  })

  it("throws when upstream is not absolute (anti-SSRF)", () => {
    expect(() => createSanctumRouteProxy({ upstream: "/relative" })).toThrow()
  })

  it("forwards Set-Cookie from upstream", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "laravel_session=new; Path=/; HttpOnly" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(new Request("https://app.test/x"), ctx(["login"]))
    expect(res.headers.get("set-cookie")).toContain("laravel_session=new")
  })

  it("forwards only allowlisted response headers (strips internal ones)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("ok", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-powered-by": "PHP/8.3",
            server: "nginx",
          },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(new Request("https://app.test/x"), ctx(["api", "user"]))
    expect(res.headers.get("content-type")).toBe("application/json")
    expect(res.headers.get("x-powered-by")).toBeNull()
    expect(res.headers.get("server")).toBeNull()
  })

  it("forwards Origin & Referer (Sanctum SPA stateful detection)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("ok", { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })

    const req = new Request("https://app.test/api/sanctum/api/user", {
      headers: {
        origin: "https://app.test",
        referer: "https://app.test/dashboard",
      },
    })
    await handler(req, ctx(["api", "user"]))

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get("origin")).toBe("https://app.test")
    expect(headers.get("referer")).toBe("https://app.test/dashboard")
  })

  it("forwards X-Forwarded-For (Laravel throttling / audit)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("ok", { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })

    const req = new Request("https://app.test/api/sanctum/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.7" },
      body: "{}",
    })
    await handler(req, ctx(["login"]))

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7")
  })

  it("defaults to Cache-Control: no-store when upstream omits it", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(new Request("https://app.test/x"), ctx(["api", "user"]))
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("keeps the upstream Cache-Control when present", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "cache-control": "public, max-age=60" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const handler = createSanctumRouteProxy({ upstream: "https://api.laravel.test" })
    const res = await handler(new Request("https://app.test/x"), ctx(["api", "user"]))
    expect(res.headers.get("cache-control")).toBe("public, max-age=60")
  })
})
