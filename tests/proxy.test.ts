// @vitest-environment node
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { createSanctumProxy } from "../src/proxy"

function req(path: string, cookie?: string): NextRequest {
  return new NextRequest("https://app.test" + path, {
    headers: cookie ? { cookie } : {},
  })
}

describe("createSanctumProxy", () => {
  const proxy = createSanctumProxy({
    authOnly: ["/dashboard/:path*", "/dashboard", "/account"],
    guestOnly: ["/login"],
    redirect: { onAuthOnly: "/login", onGuestOnly: "/", keepRequestedRoute: true },
  })

  it("guest on authOnly → redirect /login with ?redirect=", () => {
    const res = proxy(req("/dashboard/settings"))
    const location = res.headers.get("location")
    expect(location).not.toBeNull()
    const url = new URL(location as string)
    expect(url.pathname).toBe("/login")
    expect(url.searchParams.get("redirect")).toBe("/dashboard/settings")
  })

  it("authed user on authOnly → passes through (next)", () => {
    const res = proxy(req("/dashboard", "laravel_session=abc"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("authed user on guestOnly → redirect /", () => {
    const res = proxy(req("/login", "laravel_session=abc"))
    const url = new URL(res.headers.get("location") as string)
    expect(url.pathname).toBe("/")
  })

  it("guest on guestOnly → passes through (next)", () => {
    const res = proxy(req("/login"))
    expect(res.headers.get("location")).toBeNull()
  })

  it("non-matching path → passes through (next)", () => {
    const res = proxy(req("/public"))
    expect(res.headers.get("location")).toBeNull()
  })
})
