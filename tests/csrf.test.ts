import { beforeEach, describe, expect, it } from "vitest"
import { readCookie, readXsrfToken } from "../src/core/http/csrf"

beforeEach(() => {
  for (const name of ["XSRF-TOKEN", "foo"]) {
    document.cookie = `${name}=; Max-Age=0`
  }
})

describe("csrf", () => {
  it("reads a cookie value", () => {
    document.cookie = "foo=bar"
    expect(readCookie("foo")).toBe("bar")
  })

  it("URL-decodes the XSRF token (common Sanctum bug source)", () => {
    document.cookie = "XSRF-TOKEN=" + encodeURIComponent("a=b/c+d==")
    expect(readXsrfToken("XSRF-TOKEN")).toBe("a=b/c+d==")
  })

  it("returns null when the cookie does not exist", () => {
    expect(readXsrfToken("NONEXISTENT-COOKIE")).toBeNull()
  })
})
