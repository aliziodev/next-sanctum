// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  applySetCookies,
  decodeCookieValue,
  parseSetCookie,
} from "../src/core/http/cookies"

describe("decodeCookieValue", () => {
  it("URL-decodes a value", () => {
    expect(decodeCookieValue("a%3Db%20c")).toBe("a=b c")
  })
  it("returns malformed percent-encoding raw instead of throwing", () => {
    expect(decodeCookieValue("%zz-malformed")).toBe("%zz-malformed")
  })
})

describe("parseSetCookie", () => {
  it("parses name, value & attributes", () => {
    const c = parseSetCookie(
      "laravel_session=abc; Path=/; Max-Age=120; SameSite=Lax; Secure; HttpOnly",
    )
    expect(c).toEqual({
      name: "laravel_session",
      value: "abc",
      options: {
        path: "/",
        maxAge: 120,
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      },
    })
  })

  it("drops invalid Max-Age (NaN / empty) instead of passing it on", () => {
    expect(parseSetCookie("a=b; Max-Age=abc")?.options.maxAge).toBeUndefined()
    expect(parseSetCookie("a=b; Max-Age=")?.options.maxAge).toBeUndefined()
    expect(parseSetCookie("a=b; Max-Age=0")?.options.maxAge).toBe(0)
  })

  it("drops an invalid Expires date", () => {
    expect(parseSetCookie("a=b; Expires=not-a-date")?.options.expires).toBeUndefined()
    expect(
      parseSetCookie("a=b; Expires=Wed, 09 Jun 2027 10:18:14 GMT")?.options.expires,
    ).toBeInstanceOf(Date)
  })

  it("rejects an empty cookie name", () => {
    expect(parseSetCookie("=value; Path=/")).toBeNull()
  })

  it("strips surrounding quotes from the value", () => {
    expect(parseSetCookie('a="quoted"; Path=/')?.value).toBe("quoted")
  })
})

describe("applySetCookies", () => {
  it("mirrors Set-Cookie headers into a writable store", () => {
    const jar = new Map<string, string>()
    const store = {
      set: (name: string, value: string) => {
        jar.set(name, value)
      },
    }
    const response = new Response(null, {
      headers: { "set-cookie": "XSRF-TOKEN=tok; Path=/" },
    })
    applySetCookies(store, response)
    expect(jar.get("XSRF-TOKEN")).toBe("tok")
  })
})
