import { describe, expect, it } from "vitest"
import { resolveConfig } from "../src/core/config"
import { createSanctumClient } from "../src/core/http/client"
import { createAuthApi } from "../src/features/auth"
import { MemoryStorage } from "../src/storage"
import { makeFetch } from "./helpers"

describe("token mode (Bearer)", () => {
  it("login stores token & attaches Authorization Bearer", async () => {
    const { fn, calls } = makeFetch([
      { method: "POST", path: "/login", body: { token: "abc.def" } },
      { method: "GET", path: "/api/user", body: { id: 1, name: "Budi" } },
    ])
    const storage = new MemoryStorage()
    const config = resolveConfig({
      baseUrl: "https://api.test",
      mode: "token",
      fetch: fn,
      storage,
    })
    const client = createSanctumClient(config, { getToken: () => storage.get() })
    const auth = createAuthApi(client, config, {
      setToken: (t) => storage.set(t),
    })

    const result = await auth.login({ email: "a@b.com", password: "x" })
    expect(result.status).toBe("authenticated")
    expect(storage.get()).toBe("abc.def")

    const userCall = calls.find((c) => c.url.endsWith("/api/user"))
    expect(userCall?.headers.get("authorization")).toBe("Bearer abc.def")
  })

  it("logout removes the token", async () => {
    const { fn } = makeFetch([{ method: "POST", path: "/logout" }])
    const storage = new MemoryStorage()
    storage.set("tok")
    const config = resolveConfig({
      baseUrl: "https://api.test",
      mode: "token",
      fetch: fn,
      storage,
    })
    const client = createSanctumClient(config, { getToken: () => storage.get() })
    const auth = createAuthApi(client, config, {
      clearToken: () => storage.remove(),
    })
    await auth.logout()
    expect(storage.get()).toBeNull()
  })

  it("throws (fail-fast) when login needs 2FA in token mode", async () => {
    const { fn } = makeFetch([
      { method: "POST", path: "/login", body: { two_factor: true } },
    ])
    const config = resolveConfig({
      baseUrl: "https://api.test",
      mode: "token",
      fetch: fn,
    })
    const auth = createAuthApi(createSanctumClient(config), config)
    await expect(auth.login({ email: "a@b.com", password: "x" })).rejects.toThrow(
      /cookie mode/,
    )
  })
})
