// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const cookieJar = new Map<string, string>()
const cookieStore = {
  get: (name: string) =>
    cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  toString: () => [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; "),
}
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }))

import { getUser, serverFetch } from "../src/server"

beforeEach(() => {
  cookieJar.clear()
  process.env.SANCTUM_BASE_URL = "https://api.test"
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("serverFetch (anti-SSRF)", () => {
  it("rejects an absolute URL with a different origin", async () => {
    vi.stubGlobal("fetch", vi.fn())
    await expect(serverFetch("https://evil.com/steal")).rejects.toThrow(/anti-SSRF/)
  })

  it("allows a same-origin absolute URL", async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await serverFetch("https://api.test/api/user")
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.test/api/user")
  })

  it("presents the base origin as Origin (Sanctum stateful SSR auth)", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await serverFetch("/api/user")
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get("origin")).toBe("https://api.test")
  })

  it("bootstraps the CSRF cookie for stateful requests", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, {
          status: 204,
          headers: { "set-cookie": "XSRF-TOKEN=tok123; Path=/" },
        })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await serverFetch("/logout", { method: "POST" })

    expect(cookieJar.get("XSRF-TOKEN")).toBe("tok123")
    const postCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/logout"),
    )
    const headers = postCall?.[1]?.headers as Headers
    expect(headers.get("X-XSRF-TOKEN")).toBe("tok123")
  })
})

describe("getUser", () => {
  it("returns null on network error (no SSR crash)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED")
      }),
    )
    expect(await getUser()).toBeNull()
  })

  it("returns null on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    )
    expect(await getUser()).toBeNull()
  })

  it("throws (fail-fast) when SANCTUM_BASE_URL is missing", async () => {
    delete process.env.SANCTUM_BASE_URL
    delete process.env.NEXT_PUBLIC_SANCTUM_BASE_URL
    vi.stubGlobal("fetch", vi.fn())
    await expect(getUser()).rejects.toThrow()
  })
})
