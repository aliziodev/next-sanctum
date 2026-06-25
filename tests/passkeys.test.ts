import { beforeEach, describe, expect, it, vi } from "vitest"

const { register, verify, configure, isSupported } = vi.hoisted(() => ({
  register: vi.fn(async () => ({ id: "pk_1", name: "MacBook" })),
  verify: vi.fn(async () => ({})),
  configure: vi.fn(),
  isSupported: vi.fn(() => true),
}))

vi.mock("@laravel/passkeys", () => ({
  Passkeys: { configure, isSupported, register, verify },
}))

import { resolveConfig } from "../src/core/config"
import { createSanctumClient } from "../src/core/http/client"
import { createPasskeysApi } from "../src/features/passkeys"
import { makeFetch } from "./helpers"

function setup(passkeys: boolean) {
  const { fn, calls } = makeFetch([
    { method: "DELETE", path: "/user/passkeys/pk_1" },
  ])
  const config = resolveConfig({
    baseUrl: "https://api.test",
    fetch: fn,
    features: { passkeys },
  })
  return { api: createPasskeysApi(createSanctumClient(config), config), calls }
}

beforeEach(() => {
  document.cookie = "XSRF-TOKEN=tok"
  register.mockClear()
  verify.mockClear()
  configure.mockClear()
})

describe("passkeys interop", () => {
  it("register: routes absolute + name + configure CSRF", async () => {
    const { api } = setup(true)
    const res = await api.register("MacBook")
    expect(res).toEqual({ id: "pk_1", name: "MacBook" })
    expect(register).toHaveBeenCalledWith({
      name: "MacBook",
      routes: {
        options: "https://api.test/user/passkeys/options",
        submit: "https://api.test/user/passkeys",
      },
    })
    expect(configure).toHaveBeenCalledWith({
      fetch: { credentials: "include", headers: { "X-XSRF-TOKEN": "tok" } },
    })
  })

  it("login: verify with login routes", async () => {
    const { api } = setup(true)
    await api.login()
    expect(verify).toHaveBeenCalledWith({
      routes: {
        options: "https://api.test/passkeys/login/options",
        submit: "https://api.test/passkeys/login",
      },
    })
  })

  it("delete → DELETE /user/passkeys/{id}", async () => {
    const { api, calls } = setup(true)
    await api.delete("pk_1")
    expect(
      calls.some(
        (c) => c.method === "DELETE" && c.url.endsWith("/user/passkeys/pk_1"),
      ),
    ).toBe(true)
  })

  it("confirmPassword: verify with confirm routes", async () => {
    const { api } = setup(true)
    await api.confirmPassword()
    expect(verify).toHaveBeenCalledWith({
      routes: {
        options: "https://api.test/passkeys/confirm/options",
        submit: "https://api.test/passkeys/confirm",
      },
    })
  })

  it("isSupported delegates to @laravel/passkeys", async () => {
    const { api } = setup(true)
    expect(await api.isSupported()).toBe(true)
    expect(isSupported).toHaveBeenCalled()
  })

  it("throws when passkeys are disabled", async () => {
    const { api } = setup(false)
    await expect(api.register("x")).rejects.toThrow(/disabled/)
  })
})
