import { describe, expect, it } from "vitest"
import {
  ConfigError,
  errorFromResponse,
  networkError,
  SanctumError,
  ValidationError,
} from "../src/core/errors"
import { joinUrl, parseJson } from "../src/core/http/request"

describe("joinUrl", () => {
  it("joins a relative path onto the base", () => {
    expect(joinUrl("https://api.test", "/login")).toBe("https://api.test/login")
    expect(joinUrl("https://api.test/", "login")).toBe("https://api.test/login")
  })
  it("passes same-origin absolute URLs through", () => {
    expect(joinUrl("https://api.test", "https://api.test/x")).toBe(
      "https://api.test/x",
    )
    expect(joinUrl("https://api.test/base", "HTTPS://api.test/x")).toBe(
      "HTTPS://api.test/x",
    )
  })
  it("rejects cross-origin absolute URLs (credential leak)", () => {
    expect(() => joinUrl("https://api.test", "https://other.test/x")).toThrow(
      ConfigError,
    )
    expect(() => joinUrl("https://api.test", "https://api.test:8443/x")).toThrow(
      ConfigError,
    )
    expect(() => joinUrl("https://api.test", "http://api.test/x")).toThrow(
      ConfigError,
    )
  })
})

describe("parseJson", () => {
  it("returns undefined for 204 / empty body", async () => {
    expect(await parseJson(new Response(null, { status: 204 }))).toBeUndefined()
    expect(await parseJson(new Response("", { status: 200 }))).toBeUndefined()
  })
  it("parses a JSON body", async () => {
    expect(
      await parseJson(new Response(JSON.stringify({ a: 1 }), { status: 200 })),
    ).toEqual({ a: 1 })
  })
  it("throws SanctumError on a non-JSON 2xx body", async () => {
    await expect(
      parseJson(new Response("<html/>", { status: 200 })),
    ).rejects.toBeInstanceOf(SanctumError)
  })
})

describe("errorFromResponse", () => {
  it("maps status → kind", async () => {
    expect((await errorFromResponse(new Response(null, { status: 401 }))).kind).toBe(
      "unauthorized",
    )
    expect((await errorFromResponse(new Response(null, { status: 403 }))).kind).toBe(
      "forbidden",
    )
    expect((await errorFromResponse(new Response(null, { status: 419 }))).kind).toBe(
      "csrf",
    )
    expect((await errorFromResponse(new Response(null, { status: 500 }))).kind).toBe(
      "http",
    )
  })

  it("returns a ValidationError with field errors on 422", async () => {
    const err = await errorFromResponse(
      new Response(JSON.stringify({ message: "x", errors: { email: ["req"] } }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }),
    )
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as ValidationError).errors).toEqual({ email: ["req"] })
  })

  it("networkError wraps a cause as kind=network", () => {
    expect(networkError(new Error("boom")).kind).toBe("network")
  })
})
