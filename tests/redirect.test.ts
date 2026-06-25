import { describe, expect, it } from "vitest"
import { safeRedirect } from "../src/core/redirect"

describe("safeRedirect", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeRedirect("/dashboard", "/")).toBe("/dashboard")
    expect(safeRedirect("/a/b?x=1", "/")).toBe("/a/b?x=1")
  })

  it("falls back for null/empty", () => {
    expect(safeRedirect(null, "/home")).toBe("/home")
    expect(safeRedirect(undefined, "/home")).toBe("/home")
    expect(safeRedirect("", "/home")).toBe("/home")
    expect(safeRedirect("   ", "/home")).toBe("/home")
  })

  it("rejects protocol-relative //evil.com", () => {
    expect(safeRedirect("//evil.com", "/home")).toBe("/home")
  })

  it("rejects absolute cross-origin", () => {
    expect(safeRedirect("https://evil.com/x", "/home")).toBe("/home")
    expect(
      safeRedirect("https://evil.com", "/home", { origin: "https://app.com" }),
    ).toBe("/home")
  })

  it("rejects backslash tricks", () => {
    expect(safeRedirect("/\\evil.com", "/home")).toBe("/home")
    expect(safeRedirect("\\\\evil.com", "/home")).toBe("/home")
  })

  it("rejects control-char injection (tab/newline) that the URL parser strips", () => {
    // `/\t//evil.com` collapses to `//evil.com` in the browser → must be rejected.
    expect(safeRedirect("/\t//evil.com", "/home")).toBe("/home")
    expect(safeRedirect("/\t/evil.com", "/home", { origin: "https://app.com" })).toBe(
      "/home",
    )
    expect(safeRedirect("/\n/evil.com", "/home")).toBe("/home")
    expect(safeRedirect("/foo\r/bar", "/home")).toBe("/home")
  })

  it("rejects the javascript: scheme", () => {
    expect(safeRedirect("javascript:alert(1)", "/home")).toBe("/home")
    expect(
      safeRedirect("javascript:alert(1)", "/home", { origin: "https://app.com" }),
    ).toBe("/home")
  })

  it("allows absolute same-origin → returns the path", () => {
    expect(
      safeRedirect("https://app.com/dash?x=1", "/home", {
        origin: "https://app.com",
      }),
    ).toBe("/dash?x=1")
  })

  it("respects allowList", () => {
    expect(safeRedirect("/admin", "/home", { allowList: ["/dashboard"] })).toBe(
      "/home",
    )
    expect(
      safeRedirect("/dashboard/x", "/home", { allowList: ["/dashboard"] }),
    ).toBe("/dashboard/x")
  })
})
