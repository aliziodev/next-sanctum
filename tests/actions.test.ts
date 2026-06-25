// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const cookieJar = new Map<string, string>()
const cookieStore = {
  get: (name: string) =>
    cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
  set: (name: string, value: string) => {
    cookieJar.set(name, value)
  },
  toString: () =>
    [...cookieJar].map(([k, v]) => `${k}=${v}`).join("; "),
}
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }))

import {
  confirmPassword,
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
  twoFactorChallenge,
} from "../src/actions"

beforeEach(() => {
  cookieJar.clear()
  vi.restoreAllMocks()
})

describe("actions.login", () => {
  it("CSRF → login: writes Set-Cookie & sends X-XSRF-TOKEN", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, {
          status: 204,
          headers: { "set-cookie": "XSRF-TOKEN=tok123; Path=/" },
        })
      }
      if (url.endsWith("/login")) {
        return new Response(JSON.stringify({ two_factor: false }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": "laravel_session=sess; Path=/; HttpOnly",
          },
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await login(
      { email: "a@b.com", password: "x" },
      { baseUrl: "https://api.test" },
    )

    expect(result.ok).toBe(true)
    expect(result.twoFactor).toBe(false)
    expect(cookieJar.get("XSRF-TOKEN")).toBe("tok123")
    expect(cookieJar.get("laravel_session")).toBe("sess")

    const loginCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("/login"),
    )
    const headers = loginCall?.[1]?.headers as Record<string, string>
    expect(headers["X-XSRF-TOKEN"]).toBe("tok123")
  })

  it("login 422 → ok:false + errors", async () => {
    cookieJar.set("XSRF-TOKEN", "tok") // skip the csrf fetch
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: "Invalid", errors: { email: ["required"] } }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await login(
      { email: "", password: "" },
      { baseUrl: "https://api.test" },
    )
    expect(result.ok).toBe(false)
    expect(result.status).toBe(422)
    expect(result.errors).toEqual({ email: ["required"] })
  })

  it("logout & register resolve ok via statefulPost → toResult", async () => {
    cookieJar.set("XSRF-TOKEN", "tok")
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(null, {
          status: url.endsWith("/register") ? 201 : 200,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    expect((await logout({ baseUrl: "https://api.test" })).ok).toBe(true)
    expect(
      (await register({ email: "a@b.com" }, { baseUrl: "https://api.test" })).ok,
    ).toBe(true)
  })

  it("forgot/reset/confirm/twoFactorChallenge resolve ok", async () => {
    cookieJar.set("XSRF-TOKEN", "tok")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    const cfg = { baseUrl: "https://api.test" }
    expect((await forgotPassword({ email: "a@b.com" }, cfg)).ok).toBe(true)
    expect(
      (
        await resetPassword(
          {
            token: "t",
            email: "a@b.com",
            password: "x",
            password_confirmation: "x",
          },
          cfg,
        )
      ).ok,
    ).toBe(true)
    expect((await confirmPassword({ password: "x" }, cfg)).ok).toBe(true)
    expect((await twoFactorChallenge({ code: "123456" }, cfg)).ok).toBe(true)
  })
})
