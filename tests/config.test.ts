import { describe, expect, it } from "vitest"
import { resolveConfig } from "../src/core/config"
import { ConfigError } from "../src/core/errors"

describe("resolveConfig", () => {
  it("fail-fast (ConfigError) when baseUrl is missing", () => {
    // @ts-expect-error intentionally invalid input
    expect(() => resolveConfig({})).toThrow(ConfigError)
  })

  it("fills in defaults & strips trailing slash from baseUrl", () => {
    const c = resolveConfig({ baseUrl: "https://api.test/" })
    expect(c.baseUrl).toBe("https://api.test")
    expect(c.mode).toBe("cookie")
    expect(c.csrf).toEqual({ cookie: "XSRF-TOKEN", header: "X-XSRF-TOKEN" })
    expect(c.endpoints.login).toBe("/login")
    expect(c.endpoints.twoFactor.challenge).toBe("/two-factor-challenge")
    expect(c.logLevel).toBe(3)
    expect(c.initialRequest).toBe(true)
  })

  it("normalizes feature flags", () => {
    const c = resolveConfig({
      baseUrl: "https://api.test",
      features: {
        twoFactorAuthentication: true,
        passkeys: false,
        registration: false,
      },
    })
    expect(c.features.twoFactorAuthentication).toEqual({
      confirm: true,
      confirmPassword: true,
    })
    expect(c.features.passkeys).toBe(false)
    expect(c.features.registration).toBe(false)
    expect(c.features.deviceSessions).toBe(false)
  })

  it("merges custom endpoints over defaults (deep)", () => {
    const c = resolveConfig({
      baseUrl: "https://api.test",
      endpoints: { login: "/api/login", twoFactor: { challenge: "/2fa" } },
    })
    expect(c.endpoints.login).toBe("/api/login")
    expect(c.endpoints.twoFactor.challenge).toBe("/2fa")
    expect(c.endpoints.twoFactor.enable).toBe("/user/two-factor-authentication")
  })
})
