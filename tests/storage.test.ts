import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CookieTokenStorage,
  LocalStorage,
  MemoryStorage,
} from "../src/storage"

describe("MemoryStorage", () => {
  it("set/get/remove", () => {
    const s = new MemoryStorage()
    expect(s.get()).toBeNull()
    s.set("a")
    expect(s.get()).toBe("a")
    s.remove()
    expect(s.get()).toBeNull()
  })
})

describe("LocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("set/get/remove + warns once about XSS", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = new LocalStorage()
    s.set("tok")
    expect(s.get()).toBe("tok")
    expect(warn).toHaveBeenCalled()
    s.remove()
    expect(s.get()).toBeNull()
    warn.mockRestore()
  })

  it("honors a custom key", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    new LocalStorage("custom.key").set("v")
    expect(window.localStorage.getItem("custom.key")).toBe("v")
  })
})

describe("CookieTokenStorage", () => {
  beforeEach(() => {
    document.cookie = "sanctum_token=; Max-Age=0"
  })

  it("set/get/remove roundtrip (URL-encoded value)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = new CookieTokenStorage({ secure: false })
    s.set("a=b/c")
    expect(s.get()).toBe("a=b/c")
    s.remove()
    expect(s.get()).toBeNull()
  })
})
